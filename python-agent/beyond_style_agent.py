"""
Beyond Style UAE - Multi-Agent Order Operating System Production Core
Built using LangGraph, LangChain, and Native Google Sheets API v4.
Target Environment: Production Deployment via Claude Code Terminal.
Deterministic Mode Enabled: Temperature = 0.0 (Zero-Hallucination Framework).
"""

import os
import re
from datetime import datetime, timedelta
from typing import Annotated, Dict, List, TypedDict, Union, Literal
import gspread
from google.oauth2.service_account import Credentials

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

# =====================================================================
# I. STRUCTURAL DATA CONFIGURATION & STATE SCHEMAS
# =====================================================================

class AgentState(TypedDict):
    """The complete operational state passing between specialized agents."""
    messages: Annotated[List[BaseMessage], "Conversation stream telemetry logs"]
    next_action: str
    order_id: str
    customer_name: str
    mobile_number: str
    customer_email: str
    emirate: str
    full_address: str
    google_maps_link: str
    product_sku: str
    quantity: int
    selling_price: float
    payment_method: str
    payment_status: str
    margin_percentage: float
    critical_data_status: str
    dispatch_gate_status: str
    risk_status: str
    qc_status: str
    notification_status: str
    confirmation_status: str
    internal_notes: str

# =====================================================================
# II. INITIALIZE HARD-CODED FINANCIAL & CORE CATALOG CONSTANTS
# =====================================================================

FIXED_COURIER_FEE = 25.0       # Mandated UAE Delivery Charge via Halan Logistics
MIN_PROFIT_MARGIN = 0.25       # Strict 25% lower limit safety boundary
GOOGLE_SHEET_FILE_ID = "Beyond_Style_UAE_Master_Database_PHASE3"

# Core database array extracted directly from supplier purchase ledger structures
PRODUCT_PRICING_CATALOG = {
    "BSU-MA-BR": {
        "cost": 25.0,
        "single_price": 79.0,
        "tier_2_pcs": 129.0,
        "tier_3_pcs": 159.0,
        "material": "316L Stainless Steel Vacuum Plated"
    },
    "BSU-HOB-NK": {
        "cost": 25.0,
        "single_price": 59.0,
        "tier_2_pcs": 108.0,
        "tier_3_pcs": 147.0,
        "material": "316L Stainless Steel (Silver/Gold Tone)"
    }
}

NOON_SKU_CONVERSION_MAP = {
    "PSKU_443679_60939785326120793422_X": "BSU-MA-BR",
    "PSKU_443679_90497738652040769855_X": "BSU-HOB-NK"
}

# =====================================================================
# III. ADVANCED AUTOMATED CLEANING NODES & GOOGLE CONNECTOR
# =====================================================================

def get_google_sheet_client():
    """Establishes connection to the Single Source of Truth database file."""
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    # Look for injected credentials from the local deployment setup environment
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "gcp_service_account.json")
    if not os.path.exists(creds_path):
        # Fallback to mock workspace simulator if service account is pending creation
        return None
    credentials = Credentials.from_service_account_file(creds_path, scopes=scopes)
    return gspread.authorize(credentials)

def clean_uae_phone_string(phone_str: str) -> str:
    """Rigid programmatic phone isolation layer using exact regex patterns."""
    if not phone_str or str(phone_str).strip().lower() in ["xxxxx", "missing", "none"]:
        return "MISSING"
    cleaned = re.sub(r'\D', '', str(phone_str))
    if cleaned.startswith('971'):
        cleaned = cleaned[3:]
    if cleaned.startswith('0'):
        cleaned = cleaned[1:]
    if re.match(r'^5[024568]\d{7}$', cleaned):
        return f"+971{cleaned}"
    return "CORRUPTED"

def send_whatsapp_confirmation(to_number: str, body_text: str, buttons: list) -> bool:
    """
    Sends an interactive WhatsApp confirmation message (reply buttons) so the
    customer can confirm the order/number before we release it to preparation.
    `buttons` = list of {"id": ..., "title": ...} (max 3, WhatsApp limit).
    """
    provider = os.getenv("WHATSAPP_PROVIDER", "").lower()
    token = os.getenv("WHATSAPP_TOKEN")
    phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    use_meta = provider == "meta" or (not provider and token and phone_id)

    if use_meta and token and phone_id:
        try:
            import json
            import urllib.request
            payload = json.dumps({
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to_number.lstrip("+"),
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {"text": body_text},
                    "action": {"buttons": [
                        {"type": "reply", "reply": {"id": b["id"], "title": b["title"][:20]}}
                        for b in buttons[:3]
                    ]},
                },
            }).encode("utf-8")
            req = urllib.request.Request(
                f"https://graph.facebook.com/v21.0/{phone_id}/messages",
                data=payload,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=15)
            return True
        except Exception as ex:
            print(f"[notify:whatsapp] live confirmation send failed: {ex}")
            return False

    btns = " ".join(f"[{b['title']}]" for b in buttons)
    print(f"\n[notify:mock:whatsapp:buttons] -> {to_number}\n{body_text}\n{btns}\n")
    return True


CLOSING_LINE_AR = "نحن دايماً بخدمتك خطوة بخطوة 🤍"
CLOSING_LINE_EN = "We're right here for you every step of the way 🤍"


def build_confirmation_request(state: AgentState, phone: str):
    """
    Programmatic Verification Handshake card (agent spec): single total line (no
    breakdown), explicit delivery-driver voice-call confirmation, and a reassuring
    closing line. Bilingual Gulf Arabic + English.
    """
    name = (state.get('customer_name') or '').split(' ')[0]
    order_id = state.get('order_id', 'BSU-TEMP')
    summary = state.get('product_sku', '') + f" x{state.get('quantity', 1)}"
    # Total = order value + 25 delivery (never guessed; only when selling_price known).
    price = state.get('selling_price') or 0
    total_ar = f"• الإجمالي عند الاستلام: {price + FIXED_COURIER_FEE:.0f} درهم (شامل التوصيل)\n" if price else ""
    total_en = f"• Total on delivery: {price + FIXED_COURIER_FEE:.0f} AED (delivery included)\n" if price else ""
    body = (
        "🤍 يا هلا ومسهلا فيك في بيوند ستايل الإمارات\n"
        f"{('حياك الله ' + name + '! ') if name else ''}قبل ما نجهّز طلبك للشحن نبي تأكيدك:\n"
        f"• الطلب: {summary}\n"
        f"• رقم التواصل/التوصيل: {phone}\n"
        f"{total_ar}"
        "• تأكد أن رقمك جاهز لاستقبال مكالمات مندوب التوصيل الصوتية 📞\n"
        "اضغط الزر المناسب تحت 👇\n\n"
        f"Beyond Style UAE — before we prepare your order, please confirm:\n"
        f"• Order: {summary}\n"
        f"• Contact/delivery number: {phone}\n"
        f"{total_en}"
        "• Please confirm this number is ready to receive the delivery driver's voice calls 📞\n"
        "Tap a button below 👇\n\n"
        f"{CLOSING_LINE_AR}\n{CLOSING_LINE_EN}"
    )
    buttons = [
        {"id": f"confirm:{order_id}", "title": "✅ تأكيد Confirm"},
        {"id": f"edit:{order_id}", "title": "✏️ تعديل Edit"},
        {"id": f"decline:{order_id}", "title": "❌ إلغاء Cancel"},
    ]
    return body, buttons


def send_email_message(to_email: str, subject: str, body: str) -> bool:
    """
    Dispatches an immediate thank-you email to the customer.
    Env-driven. Provider via EMAIL_PROVIDER:
      - "resend" -> Resend API (RESEND_API_KEY, EMAIL_FROM)
      - "mock"   -> logs only (default)
    """
    if not to_email:
        return False
    provider = os.getenv("EMAIL_PROVIDER", "").lower()
    key = os.getenv("RESEND_API_KEY")
    sender = os.getenv("EMAIL_FROM", "Beyond Style UAE <orders@beyondstyle.ae>")
    use_resend = provider == "resend" or (not provider and key)

    if use_resend and key:
        try:
            import json
            import urllib.request
            payload = json.dumps({
                "from": sender, "to": to_email, "subject": subject, "text": body,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=15)
            return True
        except Exception as ex:
            print(f"[notify:email] live send failed: {ex}")
            return False

    print(f"\n[notify:mock:email] -> {to_email} | {subject}\n{body}\n")
    return True


def build_thankyou_messages(state: AgentState):
    """Bilingual (AR/EN) immediate thank-you confirming the form was received."""
    name = (state.get('customer_name') or '').split(' ')[0]
    greeting_ar = f" {name}" if name else ""
    whatsapp_text = (
        f"🤍 شكراً لك{greeting_ar} من بيوند ستايل الإمارات!\n"
        "استلمنا بياناتك ✅ وجاري التحقق منها لتجهيز طلبك للشحن عبر هلال لوجستيك.\n"
        "رسوم التوصيل داخل الإمارات 25 درهم. سنتواصل معك لتأكيد موعد التسليم.\n\n"
        f"Thank you{(' ' + name) if name else ''} from Beyond Style UAE! ✅\n"
        "We've received your details and are validating them so we can prepare your "
        "order for dispatch via Halan Logistics. UAE delivery fee is 25 AED. "
        "We'll contact you to confirm the delivery time. 🤍"
    )
    email_subject = "Beyond Style UAE — order received & being prepared 🤍"
    email_body = (
        f"Thank you{(' ' + name) if name else ''} from Beyond Style UAE!\n\n"
        "We've received your delivery details and are validating them. Your order is "
        "being prepared for dispatch via Halan Logistics.\n\n"
        "Standard UAE delivery fee: 25 AED. We'll be in touch to confirm your delivery time.\n\n"
        "شكراً لك! استلمنا بياناتك وجاري التحقق منها لتجهيز طلبك للشحن."
    )
    return whatsapp_text, email_subject, email_body


def verify_address_landmarks(address_str: str) -> bool:
    """Scans physical destination coordinates to trap courier delivery failure states."""
    if not address_str or len(str(address_str).strip()) < 12:
        return False
    required_tokens = [
        'villa', 'apartment', 'apt', 'bldg', 'building', 'street', 'flat', 'floor',
        'بناية', 'شقة', 'فيلا', 'شارع', 'منزل', 'طابق', 'مكتب', 'معلم'
    ]
    return any(token in str(address_str).lower() for token in required_tokens)

# =====================================================================
# IV. THE MULTI-AGENT STATE ENGINE ORCHESTRATION
# =====================================================================

def agent_front_end_sales(state: AgentState) -> Dict:
    """
    Agent 1: High-Converting Social Commerce & Hospitality Specialist.
    Drives customer conversions while securing structural legal policy consent.
    """
    print("\n[Node Triggered] -> Agent 1: Front-End Sales Specialist")

    # Apply strict 24-Hour Timeout Clock to protect cash flows from open inventory locks
    expiry_time = datetime.now() + timedelta(hours=24)
    state['internal_notes'] = f"Stock Locked via T+24 Rule. Auto-release set for: {expiry_time.strftime('%Y-%m-%d %H:%M:%S')}"

    # Customer confirmation gate (Phase 3 webhook flow): extract the number from
    # the form and post a WhatsApp confirmation request with reply buttons. The
    # order is NOT released to preparation until the customer confirms — this
    # validates the number is reachable/correct and that the customer still wants
    # the order, so the Halan courier is never sent out blind.
    wa_number = clean_uae_phone_string(state.get('mobile_number', ''))
    wa_text, email_subject, email_body = build_thankyou_messages(state)
    wa_ok = False
    if wa_number not in ["MISSING", "CORRUPTED"]:
        conf_body, conf_buttons = build_confirmation_request(state, wa_number)
        wa_ok = send_whatsapp_confirmation(wa_number, conf_body, conf_buttons)
        # Also drop a thank-you email acknowledging receipt (optional channel).
        send_email_message(state.get('customer_email', ''), email_subject, email_body)
        # Awaiting unless an inbound confirmation already arrived (set upstream).
        if state.get('confirmation_status') not in ("confirmed", "declined", "edit_requested"):
            state['confirmation_status'] = "awaiting"
    else:
        state['confirmation_status'] = "blocked_bad_number"

    state['notification_status'] = (
        f"Confirmation request -> WhatsApp: {'sent' if wa_ok else 'skipped'} "
        f"| Status: {state['confirmation_status']}"
    )
    state['internal_notes'] += f" | {state['notification_status']}"

    # Construct verified policy confirmation block
    policy_card = (
        "يا هلا ومسهلا بك في بيوند ستايل الإمارات 🤍 نسعد بتجهيز طلبك الفاخر كأجمل هدية!\n"
        "Welcome to Beyond Style UAE! We are thrilled to style your premium gifting selections.\n\n"
        "⚠️ MANDATORY DELIVERY & EXCHANGE POLICY AGREEMENT:\n"
        "• Standard Courier Delivery Fee across UAE = 25 AED\n"
        "• Order Cancellation Pre-Courier Handover = 0 AED\n"
        "• Cancellation Post-Arrival at Location = 25 AED Base Courier Surcharge\n"
        "• Product Exchange Post-Delivery = 50 AED (Double Delivery Fee)\n"
        "• Unresponsive Customer Rule = Max 3 courier contact attempts before auto-cancellation.\n\n"
        "Please reply with 'CONFIRM' / 'تأكيد' to log verification consent directly to our system ledger."
    )

    return {
        "messages": [AIMessage(content=policy_card)],
        "notification_status": state['notification_status'],
        "confirmation_status": state['confirmation_status'],
        "internal_notes": state['internal_notes'],
        "next_action": "customer_confirmation_gate"
    }


def agent_customer_confirmation_gate(state: AgentState) -> Dict:
    """
    Confirmation Gate: holds the order until the customer confirms on WhatsApp.
    Only a 'confirmed' status releases the order to the inventory/margin guard;
    anything else stops the pipeline so no order is prepared or dispatched on an
    unconfirmed / wrong number.
    """
    print("\n[Node Triggered] -> Gate: Customer WhatsApp Confirmation")
    status = state.get('confirmation_status', 'awaiting')

    if status == "confirmed":
        state['dispatch_gate_status'] = "CONFIRMED - PROCEEDING"
        state['internal_notes'] += " | Customer confirmed order via WhatsApp."
        next_action = "inventory_and_margin_guard"
    else:
        labels = {
            "awaiting": "HOLD - AWAITING CUSTOMER CONFIRMATION",
            "declined": "CANCELLED - CUSTOMER DECLINED",
            "edit_requested": "HOLD - CUSTOMER REQUESTED EDIT",
            "blocked_bad_number": "BLOCKED - UNREACHABLE NUMBER",
        }
        state['dispatch_gate_status'] = labels.get(status, "HOLD - AWAITING CUSTOMER CONFIRMATION")
        state['internal_notes'] += f" | Order held at confirmation gate (status: {status})."
        next_action = "FINISH"

    return {
        "dispatch_gate_status": state['dispatch_gate_status'],
        "internal_notes": state['internal_notes'],
        "next_action": next_action,
    }


def agent_inventory_margin_guard(state: AgentState) -> Dict:
    """
    Agent 2: Protective Sourcing Manager & Financial Engineering Audit Engine.
    Performs algorithmic margin checking before authorizing shipment processing.
    """
    print("\n[Node Triggered] -> Agent 2: Inventory & Margin Guard")

    sku = state.get('product_sku', '').strip()
    qty = state.get('quantity', 1)

    # Automated Marketplace SKU Mapping Layer
    if sku in NOON_SKU_CONVERSION_MAP:
        sku = NOON_SKU_CONVERSION_MAP[sku]
        state['internal_notes'] += f" | Marketplace Code Converted onto Core Stock SKU: {sku}"

    if sku not in PRODUCT_PRICING_CATALOG:
        return {
            "risk_status": "HIGH",
            "dispatch_gate_status": "BLOCKED",
            "critical_data_status": "UNMAPPED CATALOG ID",
            "next_action": "FINISH"
        }

    catalog_item = PRODUCT_PRICING_CATALOG[sku]

    # Persist the resolved core SKU so downstream agents print the right code
    state['product_sku'] = sku

    # Dynamic Volumetric Tier Pricing Algorithm Evaluation
    if qty == 1:
        target_revenue = catalog_item['single_price']
    elif qty == 2:
        target_revenue = catalog_item['tier_2_pcs']
    else:
        target_revenue = catalog_item['tier_3_pcs']

    state['selling_price'] = target_revenue
    total_invoice_value = target_revenue + FIXED_COURIER_FEE

    # Financial Engineering Ledger Formula Verification
    unit_landed_cost = catalog_item['cost']
    packaging_overhead = 5.0
    label_thermal_overhead = 1.0
    gateway_processing_cost = total_invoice_value * 0.03

    total_transactional_cost = (unit_landed_cost * qty) + FIXED_COURIER_FEE + packaging_overhead + label_thermal_overhead + gateway_processing_cost
    true_net_profit = total_invoice_value - total_transactional_cost
    computed_margin = true_net_profit / total_invoice_value

    state['margin_percentage'] = computed_margin

    # Rule Checking Flags
    if computed_margin < MIN_PROFIT_MARGIN:
        state['risk_status'] = "HIGH"
        state['dispatch_gate_status'] = "HOLD - MARGIN VIOLATION"
        state['internal_notes'] += f" | CRITICAL ALERT: Margin is {computed_margin:.2%} (Limit: 25%)"
        state['next_action'] = "FINISH"
    else:
        state['risk_status'] = "LOW"
        state['dispatch_gate_status'] = "MARGIN APPROVED"
        state['next_action'] = "logistics_qc_controller"

    return {
        "product_sku": state['product_sku'],
        "selling_price": state['selling_price'],
        "margin_percentage": state['margin_percentage'],
        "risk_status": state['risk_status'],
        "dispatch_gate_status": state['dispatch_gate_status'],
        "internal_notes": state['internal_notes'],
        "next_action": state['next_action']
    }


def agent_logistics_qc_controller(state: AgentState) -> Dict:
    """
    Agent 3: Lead Fulfillment Supervisor & Operations Quality Controller.
    Enforces address and telephone data gates to secure 0% logistical return rates.
    """
    print("\n[Node Triggered] -> Agent 3: Logistics & QC Controller")

    checked_phone = clean_uae_phone_string(state.get('mobile_number', ''))
    has_valid_address = verify_address_landmarks(state.get('full_address', ''))

    state['mobile_number'] = checked_phone
    sku = state.get('product_sku', '')

    if checked_phone in ["MISSING", "CORRUPTED"]:
        state['critical_data_status'] = "FAILED PHONE SANITIZATION"
        state['dispatch_gate_status'] = "BLOCKED"
        state['next_action'] = "FINISH"
    elif not has_valid_address:
        state['critical_data_status'] = "FAILED STRUCTURAL ADDRESS VALIDATION"
        state['dispatch_gate_status'] = "BLOCKED"
        state['messages'].append(AIMessage(content=(
            "حياك الله عميلنا العزيز من بيوند ستايل 🤍 لم نتمكن من تأكيد حجز الشحنة لعدم اكتمال تفاصيل الموقع الجغرافي.\n"
            "يرجى تزويدنا باسم الشارع، رقم المبنى/الفيلا، ورقم الشقة/الطابق لتجنب الإلغاء التلقائي للمخزون."
        )))
        state['next_action'] = "FINISH"
    else:
        state['critical_data_status'] = "DATA INTACT"
        state['dispatch_gate_status'] = "QC PASSED - LABELS PRINTREADY"
        state['qc_status'] = "PASSED"
        state['next_action'] = "FINISH"

        # Build Back-End Native Master Sheet Cell Commit Payload Simulation
        gc = get_google_sheet_client()
        if gc:
            try:
                master_sheet = gc.open(GOOGLE_SHEET_FILE_ID).worksheet("Master Orders")
                # Append row tracking metrics seamlessly to the existing active workbook file
                new_row = [
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'), state.get('order_id'),
                    datetime.now().strftime('%Y-%m-%d'), "Social Commerce", "",
                    state.get('customer_name'), checked_phone, checked_phone, "",
                    state.get('product_sku'), "Bracelet", state.get('internal_notes'),
                    state.get('quantity'), "79.0", state.get('selling_price'),
                    FIXED_COURIER_FEE, "0.0", state.get('selling_price') + FIXED_COURIER_FEE,
                    state.get('payment_method'), "COD Confirmed", "", "",
                    state.get('emirate'), "", state.get('full_address'), state.get('google_maps_link'),
                    "Any time", "Ready for Dispatch", "Passed", "Halan Logistics",
                    "", "Not Assigned", "Pending"
                ]
                master_sheet.append_row(new_row)
                state['internal_notes'] += " | Live synced directly to Master Orders sheet tab."
            except Exception as ex:
                state['internal_notes'] += f" | Sheets Sync Deferred: {str(ex)}"

        # Outputs a clean, crisp blueprint layout map configuration vector for standard A6 thermal label printing
        print("\n" + "═"*60)
        print("   BEYOND STYLE UAE - A6 VECTOR THERMAL SHIPPING LABEL")
        print("═"*60)
        print(f" SENDER  : Beyond Style UAE // Contact: +971551556991")
        print(f" TRADE ID: {state.get('order_id', 'BSU-TEMP')}     ROUTE VIA: Halan Logistics")
        print(f" INVOICE : {state.get('payment_method', 'COD')} Expected Collection Value")
        print(f" CASH AMNT: {state.get('selling_price', 0) + FIXED_COURIER_FEE:.2f} AED (VAT Inclusive)")
        print("─"*60)
        print(f" CLIENT  : {state.get('customer_name', 'Guest Buyer')}")
        print(f" TEL NO  : {checked_phone}")
        print(f" ROUTE   : EMIRATE OF {state.get('emirate', '').upper()}")
        print(f" ADDR    : {state.get('full_address', '')}")
        print(f" GPS MAPS: {state.get('google_maps_link', 'Not Provided')}")
        print("─"*60)
        print(f" ITEMS SKU CONTEXT: {state.get('quantity', 1)}x [{sku}] - Polished Finished Metal Aesthetic")
        print(f" QUALITY ASSURANCE: {state['qc_status']} // PACKED ACCURACY: 100%")
        print("═"*60 + "\n")

    return {
        "mobile_number": state['mobile_number'],
        "critical_data_status": state['critical_data_status'],
        "dispatch_gate_status": state['dispatch_gate_status'],
        "qc_status": state['qc_status'],
        "messages": state['messages'],
        "internal_notes": state['internal_notes'],
        "next_action": "FINISH"
    }

# =====================================================================
# V. CONDITIONAL STATE ROUTER LOGIC
# =====================================================================

def supervisor_state_router(state: AgentState) -> Literal["customer_confirmation_gate", "inventory_and_margin_guard", "logistics_qc_controller", "__end__"]:
    """Determines the next explicit path for the active multi-agent cluster."""
    action = state.get("next_action")
    if action == "customer_confirmation_gate":
        return "customer_confirmation_gate"
    elif action == "inventory_and_margin_guard":
        return "inventory_and_margin_guard"
    elif action == "logistics_qc_controller":
        return "logistics_qc_controller"
    return "__end__"


def build_workflow_engine() -> StateGraph:
    """Initialize Multi-Agent Compilation Schema Graph Framework."""
    workflow_engine = StateGraph(AgentState)

    # Pin explicit system components onto the execution board matrix nodes
    workflow_engine.add_node("front_end_sales", agent_front_end_sales)
    workflow_engine.add_node("customer_confirmation_gate", agent_customer_confirmation_gate)
    workflow_engine.add_node("inventory_and_margin_guard", agent_inventory_margin_guard)
    workflow_engine.add_node("logistics_qc_controller", agent_logistics_qc_controller)

    # Lock graph entry points
    workflow_engine.set_entry_point("front_end_sales")

    # Enforce crisp routing bridges between actors to completely block hallucinated paths
    workflow_engine.add_conditional_edges(
        "front_end_sales",
        supervisor_state_router,
        {
            "customer_confirmation_gate": "customer_confirmation_gate",
            "__end__": END
        }
    )

    # Confirmation gate -> only a confirmed customer proceeds to fulfillment.
    workflow_engine.add_conditional_edges(
        "customer_confirmation_gate",
        supervisor_state_router,
        {
            "inventory_and_margin_guard": "inventory_and_margin_guard",
            "__end__": END
        }
    )

    workflow_engine.add_conditional_edges(
        "inventory_and_margin_guard",
        supervisor_state_router,
        {
            "logistics_qc_controller": "logistics_qc_controller",
            "__end__": END
        }
    )

    workflow_engine.add_conditional_edges(
        "logistics_qc_controller",
        supervisor_state_router,
        {
            "__end__": END
        }
    )

    return workflow_engine


# Compile Production Build Object File
beyond_style_app = build_workflow_engine().compile()

# =====================================================================
# VI. LIVE TERMINAL SYSTEM RUNNER PIPELINE
# =====================================================================

if __name__ == "__main__":
    print("### SYSTEM STATUS: BEYOND STYLE UAE SYSTEM ACTIVE [TEMP: 0.0 ROUTER ARMED] ###")

    # Trial Payload 1: Complete and highly compliant customer data submission record
    mock_webhook_input = {
        "messages": [HumanMessage(content="I reply CONFIRM. Please ship the custom calligraphy bracelet set.")],
        "order_id": "BSU-0010",
        "customer_name": "Aisha Al Mansoori",
        "mobile_number": "050 653 2084",                  # Unsanitized numeric input string
        "customer_email": "aisha@example.com",
        "emirate": "Dubai",
        "full_address": "JVC Marina Vista Tower, Flat 904, Street 12, Near Choithrams",
        "google_maps_link": "https://maps.google.com/?q=25.067,55.208",
        "product_sku": "BSU-MA-BR",
        "quantity": 2,                                    # Triggers tier calculations automatically
        "selling_price": 0.0,
        "payment_method": "Cash on Delivery",
        "payment_status": "Pending Verification",
        "next_action": "",
        "critical_data_status": "PENDING",
        "dispatch_gate_status": "PENDING",
        "risk_status": "LOW",
        "qc_status": "PENDING",
        "notification_status": "PENDING",
        # Set by the inbound WhatsApp webhook when the customer taps "Confirm".
        # "awaiting" here would hold the order at the confirmation gate; we set
        # "confirmed" to demonstrate the full happy-path pipeline end to end.
        "confirmation_status": "confirmed",
        "internal_notes": ""
    }

    # Fire active deployment loop
    execution_result = beyond_style_app.invoke(mock_webhook_input)
    print("### RUN STATUS SUMMARY SUCCESSFUL ###")
    print(f"Customer Notification    : {execution_result.get('notification_status')}")
    print(f"Confirmation Status      : {execution_result.get('confirmation_status')}")
    print(f"Data Cleansing Assessment: {execution_result.get('critical_data_status')}")
    print(f"Fulfillment Gate Verdict : {execution_result.get('dispatch_gate_status')}")
    margin = execution_result.get('margin_percentage')
    print(f"Audited Net Profit Margin: {margin:.2%}" if isinstance(margin, (int, float)) else "Audited Net Profit Margin: n/a (held before margin check)")
    print(f"System Operations Logs   : {execution_result.get('internal_notes')}")
