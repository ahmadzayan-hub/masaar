"""Independent PostgreSQL sessions with observed lock waits, not timing guesses."""
from contextlib import ExitStack
import json
import queue
import subprocess
import threading
import time
import uuid


class Session:
    def __init__(self, psql, env):
        self.name = "masaar-test-" + uuid.uuid4().hex
        self.process = subprocess.Popen([psql, "-XAtq", "-v", "ON_ERROR_STOP=1"],
            env={**env, "PGAPPNAME": self.name}, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.output = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()
        self.query("set test.role = 'service_role'; set statement_timeout = '15s';")

    def _read(self):
        for line in self.process.stdout:
            self.output.put(line.rstrip("\r\n"))
        self.output.put(None)

    def send(self, sql):
        marker = uuid.uuid4().hex
        self.process.stdin.write(sql + "\n\\echo " + marker + "\n")
        self.process.stdin.flush()
        return marker

    def receive(self, marker):
        lines = []
        while True:
            line = self.output.get(timeout=20)
            if line is None:
                raise AssertionError(f"SQL session exited before completion: {lines}")
            if line == marker:
                return [line for line in lines if line]
            lines.append(line)

    def query(self, sql):
        return self.receive(self.send(sql))

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        for stream in (self.process.stdin, self.process.stdout):
            stream.close()


def verify_concurrent_replays(psql, env):
    with ExitStack() as stack:
        sessions = []
        for _ in range(3):
            session = Session(psql, env)
            stack.callback(session.close)
            sessions.append(session)
        owner, contender, observer = sessions

        def overlap(first, second, release="commit"):
            owner.query("begin;")
            initial = owner.query(first)
            pending = contender.send(second)
            deadline = time.monotonic() + 5
            while True:
                waiting = observer.query("select count(*) from pg_stat_activity where application_name = '"
                    + contender.name + "' and wait_event_type = 'Lock';")
                if waiting == ["1"]:
                    break
                if time.monotonic() >= deadline:
                    raise AssertionError("Contender never waited on the uncommitted owner transaction.")
                time.sleep(0.02)
            owner.query(release + ";")
            return initial, contender.receive(pending)

        def form(event, token, phone, payload="{}"):
            return (f"select public.ingest_form_submission('{event}', '{payload}'::jsonb, '{token}', "
                f"'{{\"customerName\":\"SYNTHETIC\",\"phone\":\"{phone}\","
                f"\"whatsappNumber\":\"{phone}\",\"emirate\":\"Dubai\"}}'::jsonb);")

        a, b = overlap(form("FORM-RACE", "TOK-RACE-A", "+971500001001"),
                       form("FORM-RACE", "TOK-RACE-B", "+971500001001"))
        assert json.loads(a[0])["created"] is True
        assert json.loads(b[0])["created"] is False
        assert json.loads(b[0])["token"] == "TOK-RACE-A"
        assert observer.query("select count(*) from intake_orders where phone = '+971500001001';") == ["1"]
        print("PASS: concurrent form replay creates one intake and returns the original token", flush=True)

        _, b = overlap(form("FORM-ROLLBACK", "TOK-ROLLED-BACK", "+971500001002"),
                       form("FORM-ROLLBACK", "TOK-AFTER-ROLLBACK", "+971500001002"), "rollback")
        assert json.loads(b[0])["created"] is True
        assert json.loads(b[0])["token"] == "TOK-AFTER-ROLLBACK"
        assert observer.query("select count(*) from order_confirmations where token = 'TOK-ROLLED-BACK';") == ["0"]
        print("PASS: rollback releases the form claim for the waiting retry", flush=True)

        confirm = "select public.apply_confirmation_reply('TOK-RACE-A', 'EVENT-RACE', 'confirm', '+971500001001', '{}'::jsonb);"
        a, b = overlap(confirm, confirm)
        assert json.loads(a[0])["order_id"] == json.loads(b[0])["order_id"]
        assert json.loads(b[0])["replayed"] is True
        assert observer.query("select count(*) from orders where phone = '+971500001001';") == ["1"]
        print("PASS: concurrent confirmation replay returns one committed order", flush=True)

        def must_fail(statement, message):
            return ("do $$ begin begin " + statement.replace("select public.", "perform public.")
                + " raise exception 'FAIL: concurrent conflict accepted'; exception when others then "
                + f"if sqlerrm <> '{message}' then raise; end if; end; end $$;")

        overlap(form("FORM-CONFLICT", "TOK-CONFLICT-A", "+971500001003", '{"value":1}'),
                must_fail(form("FORM-CONFLICT", "TOK-CONFLICT-B", "+971500001003", '{"value":2}'),
                          "idempotency payload conflict"))
        assert observer.query("select count(*) from order_confirmations where token = 'TOK-CONFLICT-B';") == ["0"]
        print("PASS: concurrent changed form payload is refused after the original commits", flush=True)

        confirm = "select public.apply_confirmation_reply('TOK-CONFLICT-A', 'EVENT-FIRST', 'confirm', '+971500001003', '{}'::jsonb);"
        decline = "select public.apply_confirmation_reply('TOK-CONFLICT-A', 'EVENT-LATE', 'decline', '+971500001003', '{}'::jsonb);"
        overlap(confirm, must_fail(decline, "confirmation already resolved"))
        assert observer.query("select status from order_confirmations where token = 'TOK-CONFLICT-A';") == ["confirmed"]
        assert observer.query("select count(*) from confirmation_reply_receipts where event_id = 'EVENT-LATE';") == ["0"]
        print("PASS: competing confirmation action cannot overwrite a committed decision", flush=True)
