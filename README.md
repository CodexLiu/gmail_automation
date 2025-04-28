# Gmail Task Automator (Google Apps Script)

This Google Apps Script analyzes recent Gmail messages (incoming and outgoing) using a Large Language Model (LLM) like OpenAI's GPT or Anthropic's Claude. It extracts actionable tasks relevant to the user and automatically creates them in the user's default Google Tasks list. The script avoids duplicates and attempts to filter out automated emails and completed tasks based on context.

## Setup

1.  **Create Apps Script Project:** Go to [script.google.com](https://script.google.com/home/start), create a new project, and paste the contents of `code.gs` into the editor, replacing any default code.
2.  **Enable Services:** In the editor, go to "Services" and add: `Gmail API`, `Google Tasks API`, and `People API`.
3.  **Configure LLM:**
    *   Obtain an API key from your LLM provider (OpenAI/Anthropic).
    *   Go to "Project Settings" > "Script Properties". Add a property (e.g., `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) with your key as the value.
    *   **Crucially:** Update the `callOpenAI` function in `code.gs` with your provider's correct API endpoint URL, model name (e.g., `gpt-4.1`, `claude-3-7-sonnet-20250219`), and adjust the request/response handling logic if needed.
4.  **Set Trigger:** Go to "Triggers", click "Add Trigger", and configure it to run the `processEmails` function on a time-driven basis (e.g., every 5 minutes).
5.  **Authorize:** Save the trigger or run a function manually. Grant the requested permissions when prompted (you may need to bypass the "unverified app" warning).

## Permissions

The script requires permissions to read Gmail, manage Tasks, access user info, make external requests (to the LLM API), store data, and manage triggers. You will be prompted for authorization during setup.

## Monitoring

Check script executions and logs in the Apps Script editor under the "Executions" section.

## Customization

*   **LLM Behavior:** Modify the `prompt` in `processEmailContent` for different task extraction results.
*   **Email Scope:** Change the `searchQuery` in `processEmails` to target different emails.
*   **Target Task List:** Adjust the code near `Tasks.Tasklists.list()` to use a specific Google Tasks list. 