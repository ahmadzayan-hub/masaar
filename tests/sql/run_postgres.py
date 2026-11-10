"""Run synthetic SQL checks in a new local cluster, never a supplied database."""
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile

from concurrent_replay import verify_concurrent_replays


def main():
    binaries = {}
    for command in ("initdb", "pg_ctl", "psql"):
        binaries[command] = shutil.which(command)
        if not binaries[command]:
            raise SystemExit(f"Missing {command}: install PostgreSQL with pgcrypto and put its bin directory on PATH.")
    root = Path(__file__).resolve().parents[2]
    results = root / "test-results"
    results.mkdir(exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="masaar-postgres-", dir=results)).resolve()
    assert work.is_relative_to(results.resolve())
    data = work / "data"
    log = results / "postgres-server.log"
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
    password = secrets.token_urlsafe(32)
    password_file = work / "password"
    password_file.write_text(password, encoding="ascii")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    env.update(PGHOST="127.0.0.1", PGPORT=str(port), PGUSER="masaar_test",
               PGDATABASE="postgres", PGPASSWORD=password, PGCONNECT_TIMEOUT="5")
    started = False

    def run(command, *args, capture=False):
        return subprocess.run([binaries[command], *map(str, args)], env=env,
                              check=True, timeout=90, text=True,
                              capture_output=capture)

    def sql_file(name):
        run("psql", "-X", "-v", "ON_ERROR_STOP=1", "-f", root / name)

    def start():
        nonlocal started
        # An ephemeral port, loopback only, random synthetic password; no service
        # registration, shared volume, app credentials or external database URL.
        run("pg_ctl", "-D", data, "-l", log, "-o",
            f"-h 127.0.0.1 -p {port}", "-w", "start")
        started = True
        actual = run("psql", "-XAt", "-c", "show data_directory", capture=True).stdout.strip()
        if Path(actual).resolve() != data.resolve():
            raise RuntimeError("Connection is not the newly initialized test cluster.")

    try:
        run("initdb", "-D", data, "-U", "masaar_test", "--no-locale", "--encoding=UTF8",
            "--auth-local=trust", "--auth-host=scram-sha-256", f"--pwfile={password_file}")
        start()
        started = True
        sql_file("tests/sql/supabase_stub.sql")
        # The atomic confirmation contract ends at 0009. Later review/media
        # migrations and the real Supabase platform are outside this fixture.
        for number in range(1, 10):
            matches = list((root / "supabase/migrations").glob(f"{number:04d}_*.sql"))
            if len(matches) != 1:
                raise RuntimeError(f"Expected exactly one migration {number:04d}")
            sql_file(matches[0])
        for name in ("intake_bridge", "atomic_confirmation", "confirmation_permissions",
                     "form_intake_idempotency", "confirmation_search_path"):
            sql_file(f"tests/sql/{name}.sql")
        verify_concurrent_replays(binaries["psql"], env)
        sql_file("tests/sql/confirmation_restart_setup.sql")
        run("pg_ctl", "-D", data, "-m", "fast", "-w", "stop")
        started = False
        start()
        started = True
        sql_file("tests/sql/confirmation_restart_verify.sql")
        print("All native PostgreSQL atomic-confirmation regression tests passed.", flush=True)
    finally:
        if started:
            run("pg_ctl", "-D", data, "-m", "immediate", "-w", "stop")
        # Only this invocation's new fixture directory is removed. The server
        # log remains outside it for failure diagnosis and CI artifacts.
        assert work.is_relative_to(results.resolve()) and work.name.startswith("masaar-postgres-")
        shutil.rmtree(work)


if __name__ == "__main__":
    main()
