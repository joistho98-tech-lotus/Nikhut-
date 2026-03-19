import streamlit as st
import google.generativeai as genai
import time
from google.api_core import exceptions

# --- Nikhut AI Engine: Financial OCR & Reconciliation ---
# This script implements the retry logic for Gemini 1.5 Flash to handle quota limits.

# Configure your API Key (Make sure this is in your Environment Variables)
# In Streamlit Cloud/Local, use st.secrets or os.environ
api_key = st.secrets.get("GEMINI_API_KEY")
if not api_key:
    st.error("❌ GEMINI_API_KEY not found in secrets.")
    st.stop()

genai.configure(api_key=api_key)

def call_nikhut_with_retry(prompt, files, max_retries=3, delay=30):
    """
    Calls Gemini 1.5 Flash with automatic retry logic for Quota (429) errors.
    """
    # Initialize the Flash Model (Higher Quota than Pro)
    model = genai.GenerativeModel('gemini-flash-latest')
    
    for attempt in range(max_retries):
        try:
            # Attempt to generate the reconciliation
            response = model.generate_content([prompt, *files])
            return response.text
            
        except exceptions.ResourceExhausted:
            if attempt < max_retries - 1:
                st.warning(f"⚠️ Quota Full. Nikhut is resting for {delay}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(delay) # Wait before trying again
            else:
                st.error("❌ Quota exhausted after multiple attempts. Please enable billing in AI Studio or wait 1 minute.")
                return None
        except Exception as e:
            st.error(f"An unexpected error occurred: {e}")
            break

# --- UI Layout ---
st.set_page_config(page_title="Nikhut AI Engine", page_icon="📊")

st.title("📊 Nikhut AI Engine")
st.subheader("High-Speed Financial OCR & Reconciliation")

st.markdown("""
### Extraction Logic:
1. **Extract**: Date, Particulars, Voucher No, and Amount (Debit/Credit).
2. **Closing Balance Check**: `Difference = Internal_Bal - External_Bal`
3. **Hierarchy Match**: Date -> ID/Vch No -> Amount.
4. **Identify**: Only the "Unmatched" entries.
""")

col1, col2 = st.columns(2)

with col1:
    internal_file = st.file_uploader("Upload Internal Ledger (PDF/Image)", type=["pdf", "png", "jpg", "jpeg"])

with col2:
    external_file = st.file_uploader("Upload External Ledger (PDF/Image)", type=["pdf", "png", "jpg", "jpeg"])

if st.button("Generate Reconciliation Report"):
    if internal_file and external_file:
        with st.spinner("Nikhut is analyzing..."):
            # Prepare files for Gemini
            # Note: In a real app, you'd convert these to the format expected by genai.upload_file or inline data
            
            prompt = """
            Analyze these two financial documents (Internal vs. External).
            1. Extract Date, Particulars, Voucher No, and Amount (Debit/Credit).
            2. Perform a "Closing Balance Check" first: Difference = Internal_Bal - External_Bal
            3. Match entries using a 3-step hierarchy: Date -> ID/Vch No -> Amount.
            4. Identify only the "Unmatched" entries.
            
            Output: Provide a clean Markdown table of discrepancies. 
            If a match is found but the amount differs, flag it as "Amount Mismatch."
            """
            
            # For demonstration, we're passing the file objects directly (simplified)
            # In production, use genai.upload_file()
            result = call_nikhut_with_retry(prompt, [internal_file, external_file])
            
            if result:
                st.success("✅ Reconciliation Complete!")
                st.markdown('<div class="glass-card" style="padding: 20px; background: rgba(255,255,255,0.1); border-radius: 15px; border: 1px solid rgba(255,255,255,0.2);">', unsafe_allow_html=True)
                st.markdown(result)
                st.markdown('</div>', unsafe_allow_html=True)
    else:
        st.warning("Please upload both files to proceed.")
