import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Scope for the assistant: Read messages and modify labels (needed for categorization later)
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def main():
    creds = None
    # token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first time.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    try:
        # Connect to the Gmail API service
        service = build('gmail', 'v1', credentials=creds)

        # Fetch the user's profile information for testing
        profile = service.users().getProfile(userId='me').execute()
        
        print("\n--- CONNECTION SUCCESSFUL ---")
        print(f"Assistant connected to email: {profile['emailAddress']}")
        print(f"Total messages in inbox: {profile['messagesTotal']}")
        print("-----------------------------\n")

    except Exception as error:
        print(f"An error occurred: {error}")

if __name__ == '__main__':
    main()