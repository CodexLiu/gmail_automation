# Gmail Task Automator (Google Apps Script)

This Google Apps Script analyzes incoming and outgoing Gmail messages using a Large Language Model (LLM) like OpenAI's GPT or Anthropic's Claude to identify actionable tasks. It then automatically creates these tasks in your default Google Tasks list.

## Features

*   **Automated Processing:** Runs automatically via a time-driven trigger (e.g., every 5 minutes).
*   **Targeted Search:** Processes emails received or sent "today".
*   **User-Centric:** Identifies emails directly involving the script user (sender, recipient, or CC).
*   **LLM-Powered Analysis:** Sends email content (subject, body, sender, recipients) to an LLM for task extraction based on a detailed prompt.
*   **Context-Aware:**
    *   Handles email chains, focusing only on the latest message for task creation.
    *   Instructs the LLM to identify and filter out tasks that are already marked as completed within the email thread.
    *   Filters out tasks with deadlines that have already passed.
    *   Distinguishes between incoming tasks (assigned to the user) and outgoing commitments (made by the user).
    *   Attempts to identify and ignore automated emails (notifications, alerts, etc.).
*   **Task Creation:** Creates tasks in the user's primary Google Tasks list, including:
    *   A concise title (with optional "URGENT" or "OPTIONAL" prefix based on LLM analysis).
    *   Detailed notes derived from the LLM analysis and email subject.
    *   Due date, if identified by the LLM.
*   **Duplicate Prevention:** Stores processed message IDs in User Properties to avoid processing the same email multiple times.
*   **Robust Logging:** Uses `Logger.log` extensively for debugging and monitoring execution via the Apps Script dashboard.

## Pipeline Diagram

```mermaid
flowchart TD
    A[Start processEmails Trigger] --> B{Get Today's Date};
    B --> C{Search Gmail: `after:today`};
    C --> D{Get User Info (Email, Name)};
    D --> E{Fetch Threads (max 20)};
    E --> F{Get Processed Message IDs};
    F --> G{Loop Through Threads};
    G -- No More Threads --> Z[Update Processed IDs & End];
    G -- Next Thread --> H{Get Latest Message};
    H --> I{Get Message ID};
    I --> J{Already Processed?};
    J -- Yes --> G;
    J -- No --> K{Extract Details (Subject, Body, From, To, CC)};
    K --> L{Is User Involved?};
    L -- No --> M[Log Skip & Add to Processed];
    M --> G;
    L -- Yes --> N[Log Processing];
    N --> O[Call processEmailContent];
    O --> P[Add ID to Newly Processed];
    P --> G;

    subgraph processEmailContent
        direction LR
        O --> Q{Prepare LLM Prompt};
        Q --> R[Include Email Data, User Info, Instructions];
        R --> S{Call LLM API};
        S --> T{Parse LLM Response (JSON)};
        T --> U{Is Automated?};
        U -- Yes --> V[Log Skip & End Subgraph];
        U -- No --> W{Has Tasks?};
        W -- No --> X[Log No Tasks & End Subgraph];
        W -- Yes --> Y{Loop Through Tasks};
        Y -- No More Tasks --> ZZ[End Subgraph];
        Y -- Next Task --> AA{Valid Task? (Not completed, not past deadline, from today)};
        AA -- No --> Y;
        AA -- Yes --> BB{Prepare Task Data (Title, Notes, Due Date)};
        BB --> CC{Create Task in Google Tasks};
        CC --> Y;
    end
```

## Setup Instructions

1.  **Create Script:**
    *   Go to Google Apps Script: [script.google.com](https://script.google.com/home/start)
    *   Click "New project".
    *   Give your project a name (e.g., "Gmail Task Automator").
    *   Delete any default code in the `Code.gs` file.
    *   Copy the entire content of the `code.gs` file from this repository and paste it into the editor.

2.  **Enable Advanced Google Services:**
    *   In the script editor, go to "Services" on the left sidebar.
    *   Find and add the following services:
        *   **Gmail API:** Click "Add".
        *   **Google Tasks API:** Click "Add".
        *   **People API (Google People API):** Click "Add".
    *   *Note:* Adding these services modifies the `appsscript.json` manifest file automatically.

3.  **Configure LLM API:**
    *   Decide which LLM provider you want to use (e.g., OpenAI, Anthropic).
    *   Obtain an API key from your chosen provider.
    *   In the script editor, go to "Project Settings" (gear icon on the left sidebar).
    *   Scroll down to "Script Properties" and click "Edit script properties".
    *   Click "Add script property".
        *   **Property:** `OPENAI_API_KEY` (or a relevant name like `ANTHROPIC_API_KEY`)
        *   **Value:** Paste your actual API key here.
    *   Click "Save script properties".
    *   **Important:** Update the `callOpenAI` function in `code.gs`:
        *   Change the `apiEndpoint` variable to the correct URL for your provider's API (e.g., OpenAI Chat Completions endpoint or Anthropic Messages endpoint).
        *   Ensure the `model` specified in the `payload` matches a valid model from your provider (e.g., `"gpt-4.1"`, `"claude-3-5-sonnet-20240620"`). Modify the model name to `claude-3-7-sonnet-20250219` for the specific Anthropic model requested if using Anthropic.
        *   Adjust the `payload` structure and response parsing logic (`jsonResponse.choices[0].message.content` for OpenAI, potentially `jsonResponse.content[0].text` for Anthropic) if necessary to match your chosen LLM provider's API format.

4.  **Set Up Trigger:**
    *   In the script editor, go to "Triggers" (clock icon on the left sidebar).
    *   Click "Add Trigger".
    *   Configure the trigger as follows:
        *   **Choose which function to run:** `processEmails`
        *   **Choose which deployment should run:** `Head`
        *   **Select event source:** `Time-driven`
        *   **Select type of time based trigger:** `Minutes timer` (or `Hourly timer`)
        *   **Select minute/hour interval:** `Every 5 minutes` (or your desired frequency - be mindful of quotas)
        *   **Error notification settings:** Choose your preference.
    *   Click "Save".

5.  **Authorize Script:**
    *   The first time you save the trigger (or try to run a function manually), Google will ask for authorization.
    *   Review the permissions requested (it will need access to Gmail, Tasks, external services, etc.).
    *   If you see a "Google hasn't verified this app" screen, click "Advanced", then "Go to [Your Project Name] (unsafe)".
    *   Grant the necessary permissions.

## Permissions Required (OAuth Scopes)

The script will request the following permissions during authorization:

*   `https://www.googleapis.com/auth/gmail.readonly`: To read email content.
*   `https://www.googleapis.com/auth/tasks`: To create tasks in Google Tasks.
*   `https://www.googleapis.com/auth/script.external_request`: To call the external LLM API.
*   `https://www.googleapis.com/auth/userinfo.email`: To get the user's email address.
*   `https://www.googleapis.com/auth/script.storage`: To store processed message IDs.
*   `https://www.googleapis.com/auth/script.scriptapp`: To manage triggers.
*   `https://www.googleapis.com/auth/contacts.readonly` or `https://www.googleapis.com/auth/peopleapi.readonly.people.names.read`: To fetch the user's name via the People API (optional enhancement in `getUserInfo`).

## Monitoring and Debugging

*   Check the script's executions and logs via the "Executions" section in the Apps Script editor.
*   `Logger.log` statements provide detailed information about the script's flow, API calls, and any errors encountered.

## Customization

*   **LLM Prompt:** Modify the `prompt` variable within the `processEmailContent` function to tailor the task extraction logic, instructions, or JSON output format.
*   **Search Query:** Adjust the `searchQuery` in `processEmails` if you need to target different emails (e.g., specific labels, senders).
*   **Task List:** Currently, the script uses the first (default) task list. Modify the code near `Tasks.Tasklists.list().items` if you want to target a specific task list by name or ID.
*   **LLM Model:** Update the model name in the `callOpenAI` function payload to use different versions or providers. 