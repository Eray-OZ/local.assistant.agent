import os.path
import base64
import json
from bs4 import BeautifulSoup
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from database import is_processed

SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def get_clean_body(payload):
    def extract_parts(part):
        plain_text = ""
        html_text = ""
        
        if 'parts' in part:
            for subpart in part['parts']:
                p_text, h_text = extract_parts(subpart)
                if p_text: plain_text += p_text
                if h_text: html_text += h_text
        else:
            mime_type = part.get('mimeType')
            data = part.get('body', {}).get('data', '')
            
            if mime_type == 'text/plain':
                plain_text = data
            elif mime_type == 'text/html':
                html_text = data
                
        return plain_text, html_text

    p_data, h_data = extract_parts(payload)
    best_data = h_data if h_data else p_data

    if not best_data:
        return "No readable content found."

    best_data += "=" * ((4 - len(best_data) % 4) % 4)
    
    try:
        decoded_bytes = base64.urlsafe_b64decode(best_data)
        decoded_text = decoded_bytes.decode('utf-8', errors='ignore')

        soup = BeautifulSoup(decoded_text, 'html.parser')
        clean_text = soup.get_text(separator=' ', strip=True)
        return clean_text
    except Exception as e:
        return f"Error decoding message: {e}"

def main():
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    else:
        print("Error: token.json not found. Run test_connection.py first.")
        return

    try:
        service = build('gmail', 'v1', credentials=creds)
        print("Fetching and packaging the latest 5 emails into JSON...\n")
        
        results = service.users().messages().list(userId='me', maxResults=5).execute()
        messages = results.get('messages', [])

        if not messages:
            print("No messages found in your inbox.")
            return

        email_dataset = []

        for i, msg in enumerate(messages, 1):
            # Skip emails that have already been processed and labeled
            if is_processed(msg['id']):
                print(f"  Skipping already-processed email: {msg['id']}")
                continue

            txt = service.users().messages().get(userId='me', id=msg['id'], format='full').execute()
            payload = txt['payload']
            headers = payload.get('headers', [])

            subject = "No Subject"
            sender = "Unknown Sender"
            for header in headers:
                if header['name'] == 'Subject':
                    subject = header['value']
                elif header['name'] == 'From':
                    sender = header['value']

            body = get_clean_body(payload)

            email_data = {
                "id": msg['id'],
                "sender": sender,
                "subject": subject,
                # Truncate body to limit the number of tokens sent to the AI model
                "body": body[:500]
            }
            email_dataset.append(email_data)

        if not email_dataset:
            print("All fetched emails have already been processed. Nothing new to do.")
            return

        with open('emails_data.json', 'w', encoding='utf-8') as json_file:
            json.dump(email_dataset, json_file, ensure_ascii=False, indent=4)

        print(f"SUCCESS: {len(email_dataset)} new emails saved to 'emails_data.json'.")
        print("Ready for AI processing!")

    except Exception as error:
        print(f"An error occurred: {error}")

if __name__ == '__main__':
    main()