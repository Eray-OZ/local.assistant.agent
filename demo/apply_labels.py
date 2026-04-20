import os.path
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from database import mark_as_processed

# We need the same scope we defined earlier to modify Gmail labels
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def get_gmail_service():
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        return build('gmail', 'v1', credentials=creds)
    else:
        print("Error: token.json not found.")
        return None

def ensure_label_exists(service, label_name):
    """Checks if a label exists, if not, creates it."""
    results = service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])
    
    for label in labels:
        if label['name'].upper() == label_name.upper():
            return label['id']
    
    # Label doesn't exist, let's create it
    print(f"Creating new label: {label_name}")
    label_object = {
        'name': label_name,
        'labelListVisibility': 'labelShow',
        'messageListVisibility': 'show'
    }
    created_label = service.users().labels().create(userId='me', body=label_object).execute()
    return created_label['id']

def apply_categorization():
    service = get_gmail_service()
    if not service: return

    # 1. Load the AI's decisions
    try:
        with open('categorized_emails.json', 'r', encoding='utf-8') as f:
            categorized_emails = json.load(f)
    except FileNotFoundError:
        print("Error: categorized_emails.json not found. Run process_emails.py first.")
        return

    # 2. Apply labels based on AI categories
    for item in categorized_emails:
        msg_id = item['id']
        category = item['category']
        
        # Ensure the Gmail label (e.g., 'SOCIAL') exists
        label_id = ensure_label_exists(service, category)
        
        # 3. Add the category label to the email
        # We use 'addLabelIds' to tag it and we could use 'removeLabelIds': ['INBOX'] to archive it
        modification = {
            'addLabelIds': [label_id],
            'removeLabelIds': [] # Keep it in inbox for now so you can see the change
        }
        
        try:
            service.users().messages().modify(userId='me', id=msg_id, body=modification).execute()
            # Record the email as processed so it is skipped on the next run
            mark_as_processed(msg_id, category)
            print(f"Successfully tagged mail {msg_id} as {category}")
        except Exception as e:
            print(f"Failed to tag mail {msg_id}: {e}")

if __name__ == "__main__":
    apply_categorization()