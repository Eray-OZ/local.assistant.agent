import json
import os
from google import genai 
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=GEMINI_API_KEY)

def categorize_emails():
    try:
        with open('emails_data.json', 'r', encoding='utf-8') as f:
            emails = json.load(f)
    except FileNotFoundError:
        print("Error: emails_data.json not found. Run fetch_emails.py first.")
        return

    system_instruction = """
    Sen profesyonel bir e-posta asistanısın. 
    Sana JSON formatında bir liste vereceğim. Her maili şu kategorilerden birine ayırmanı istiyorum:
    - WORK (İş, toplantı, projeler)
    - SOCIAL (Sosyal medya bildirimleri, Steam, oyunlar)
    - PROMOTION (Reklamlar, indirimler, bültenler)
    - PERSONAL (Arkadaşlardan gelen kişisel mesajlar)
    - SPAM (Gereksiz, tehlikeli mailler)

    Cevabını SADECE şu formatta bir JSON listesi olarak ver:
    [{"id": "mail_id", "category": "KATEGORİ", "reason": "Kısa bir neden"}]
    """

    email_text = json.dumps(emails, ensure_ascii=False)
    
    full_prompt = f"{system_instruction}\n\nİşte işlenecek mailler:\n{email_text}"
    
    print("AgentAssistant is analyzing your emails via Gemini 3 Flash (New SDK)...")
    
    try:
        response = client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=full_prompt,
        )
        
        ai_content = response.text.replace('```json', '').replace('```', '').strip()
        categorized_data = json.loads(ai_content)
        
        with open('categorized_emails.json', 'w', encoding='utf-8') as f:
            json.dump(categorized_data, f, ensure_ascii=False, indent=4)
            
        print("SUCCESS: Emails categorized using the new standard! No more warnings.")
        
    except Exception as e:
        print(f"An error occurred during AI processing: {e}")

if __name__ == "__main__":
    categorize_emails()