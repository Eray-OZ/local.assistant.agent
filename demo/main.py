import os
from dotenv import load_dotenv

# Import pipeline steps from their respective modules
from fetch_emails import main as fetch_emails
from process_emails import categorize_emails
from apply_labels import apply_categorization
from database import init_db

load_dotenv()


def main():
    """Run the full email processing pipeline: fetch, categorize, apply labels."""

    if not os.getenv("GEMINI_API_KEY"):
        print("Error: GEMINI_API_KEY is not set. Check your .env file.")
        return

    # Initialize the SQLite database (creates table if not exists)
    init_db()

    # Step 1: Fetch emails from Gmail and save to emails_data.json
    print("--- Step 1: Fetching emails ---")
    fetch_emails()

    # Step 2: Categorize emails using Gemini and save to categorized_emails.json
    print("\n--- Step 2: Categorizing emails ---")
    categorize_emails()

    # Step 3: Apply category labels in Gmail
    print("\n--- Step 3: Applying Gmail labels ---")
    apply_categorization()

    print("\nPipeline finished.")


if __name__ == "__main__":
    main()
