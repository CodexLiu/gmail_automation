/**
 * Main function to process emails and create tasks
 * This runs once every minute via time-based trigger
 */
function processEmails() {
  const now = new Date();
  const today = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "yyyy/MM/dd"
  );
  const searchQuery = `after:${today}`;
  Logger.log(`Searching Gmail with query: ${searchQuery}`);

  try {
    let userInfo;
    try {
      userInfo = getUserInfo();
    } catch (userInfoError) {
      Logger.log(
        `Cannot proceed without user information: ${userInfoError.toString()}`
      );
      return;
    }

    const userEmail = userInfo.email;
    const userName = userInfo.name;
    Logger.log(`Looking for emails involving: ${userEmail} (${userName})`);

    const threads = GmailApp.search(searchQuery, 0, 20);
    Logger.log(`Found ${threads.length} threads from today`);

    const userProperties = PropertiesService.getUserProperties();
    let processedIdsJson =
      userProperties.getProperty("processedMessageIds") || "[]";
    let processedIds = JSON.parse(processedIdsJson);

    // Keep only most recent 1000 message IDs
    if (processedIds.length > 1000) {
      processedIds = processedIds.slice(processedIds.length - 1000);
    }

    const newlyProcessedIds = [];

    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      const messages = thread.getMessages();
      const latestMessage = messages[messages.length - 1];
      const messageId = latestMessage.getId();

      if (processedIds.includes(messageId)) {
        Logger.log(`Skipping already processed message ID: ${messageId}`);
        continue;
      }

      const subject = latestMessage.getSubject() || "(No Subject)";
      const body = latestMessage.getPlainBody();
      const sender = latestMessage.getFrom();
      const toRecipients = latestMessage.getTo() || "";
      const ccRecipients = latestMessage.getCc() || "";

      const isOutgoingEmail =
        sender.toLowerCase().indexOf(userEmail.toLowerCase()) > -1;
      const isIncomingEmail =
        toRecipients.toLowerCase().indexOf(userEmail.toLowerCase()) > -1 ||
        ccRecipients.toLowerCase().indexOf(userEmail.toLowerCase()) > -1;

      if (!isOutgoingEmail && !isIncomingEmail) {
        Logger.log(`Skipping email that doesn't involve the user: ${subject}`);
        continue;
      }

      Logger.log(
        `Processing ${
          isOutgoingEmail ? "OUTGOING" : "INCOMING"
        } email: "${subject}" from ${sender}`
      );

      newlyProcessedIds.push(messageId);

      processEmailContent(
        now,
        subject,
        body,
        sender,
        toRecipients,
        ccRecipients,
        messageId,
        isOutgoingEmail,
        userInfo
      );
    }

    const updatedProcessedIds = [...processedIds, ...newlyProcessedIds];
    userProperties.setProperty(
      "processedMessageIds",
      JSON.stringify(updatedProcessedIds)
    );

    Logger.log(
      `Updated processed message IDs list with ${newlyProcessedIds.length} new messages`
    );
    Logger.log("Email processing complete");
  } catch (error) {
    Logger.log(`Error in processEmails: ${error.toString()}`);
  }
}

/**
 * Process email content to extract tasks
 */
function processEmailContent(
  now,
  subject,
  body,
  sender,
  toRecipients,
  ccRecipients,
  messageId,
  isOutgoing,
  userInfo
) {
  Logger.log(`=== PROCESSING EMAIL: "${subject}" ===`);
  Logger.log(`Message ID: ${messageId}`);
  Logger.log(`Is outgoing: ${isOutgoing}`);
  Logger.log(`From: ${sender}`);
  Logger.log(`To: ${toRecipients}`);
  Logger.log(`CC: ${ccRecipients}`);
  Logger.log(`Body length: ${body.length} characters`);

  const userEmail = userInfo.email;
  const userName = userInfo.name;

  // Slightly adjust the prompt for outgoing emails
  let analysisInstruction = isOutgoing
    ? `Analyze this email SENT BY ${userName} and extract specific commitments or action items they promised to do:`
    : `Analyze this email RECEIVED BY ${userName} and extract specific, actionable tasks for them:`;

  // Create prompt for email analysis
  const prompt = `
Email content:
From: ${sender}
To: ${toRecipients}
CC: ${ccRecipients}
Subject: ${subject}

Body:
${body}

Today's date is: ${Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  )}
Current time is: ${Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "HH:mm"
  )}

${analysisInstruction}

1. First, determine if this is an automated email:
   - Check if the sender contains terms like "noreply", "no-reply", "donotreply", "automated", "notification", "alerts", "system", "info@", etc.
   - Check if the email content has generic templates, lacks personalization, or appears to be mass-generated
   - Identify if it's a marketing email, newsletter, system notification, or automatic alert
   - If you determine this is an automated email rather than from a real person, flag it as "isAutomated": true and do not create any tasks

2. IMPORTANT - TIMING, EMAIL CHAIN, AND TASK STATUS HANDLING:
   - FOCUS ONLY ON TASKS FROM TODAY'S DATE (${Utilities.formatDate(
     now,
     Session.getScriptTimeZone(),
     "yyyy-MM-dd"
   )})
   - For email chains, ONLY process tasks from the LATEST message (the top message)
   - DO NOT create tasks from older messages in the chain - these may have been processed already
   - DO NOT create tasks that appear to be ALREADY COMPLETED based on the email chain context
   - DO NOT create tasks with deadlines that have ALREADY PASSED relative to today's date
   - CAREFULLY analyze the full email chain to identify tasks that were mentioned earlier but later marked as done
   - If any task has confirmation of completion like "I've done this", "this is complete", "I finished this", mark it as isCompleted=true
   - Use previous emails in the chain ONLY AS CONTEXT to understand the latest message
   - Check dates carefully to ensure you're not creating tasks from old conversations
   - If an email includes older forwarded content or replies, only extract tasks from the newest portion
   - SET ALL TASKS fromToday=false IF they appear to be from past communications

3. Next, confirm this email is:
   - ${
     isOutgoing
       ? `OUTGOING: Sent by ${userName} to others`
       : `INCOMING: Sent to ${userName} from someone else`
   }

4. For ${
    isOutgoing
      ? `outgoing emails, identify the MOST IMPORTANT commitment ${userName} made`
      : `incoming emails, identify the MOST IMPORTANT task assigned to ${userName}`
  }. Create only ONE task per email or email chain, focusing on the most critical action item.

5. Pay special attention to:
   ${
     isOutgoing
       ? `- Promises or commitments made
   - Deadlines committed to
   - Materials or information promised to provide
   - Follow-ups agreed to do
   - Meetings scheduled or to attend`
       : `- Explicit requests or questions directed to ${userName}
   - Implied action items based on project context
   - Decisions needed
   - Required responses expected
   - Meetings expected to attend`
   }

6. For the task identified, provide:
   - A clear, concise title (starting with an action verb)
   - Who is involved in the task
   - What specific deliverable or outcome is needed
   - When it needs to be completed (if specified)
   - Any context needed to understand the task
   - Importance classification (urgent, standard, or optional) based on:
     * URGENT: Critical business needs, tight deadlines, requests from leadership, blockers for other team members
     * OPTIONAL: Nice-to-have items, low impact tasks, FYI notifications that might need action

7. IMPORTANT: Write tasks as direct commands or instructions WITHOUT using "I will" or first-person statements. Use imperative language like "Create plan for...", "Review results from...", "Respond to..." rather than "I will create plan" or "I need to respond". Tasks should read like direct orders or instructions.

Respond with JSON in the following format:
{
  "isAutomated": true/false, 
  "automatedReason": "Explanation if automated, otherwise empty",
  "emailChainAnalysis": "Brief description of whether this is a chain and which part you analyzed",
  "tasks": [
    {
      "createTask": true,
      "taskTitle": "Action verb + specific task (max 10 words)",
      "dueDate": "YYYY-MM-DD format if mentioned (empty if not specified)",
      "taskDetails": "Detailed instructions written as direct commands. Include who to coordinate with, what deliverables are needed, and relevant context or deadlines",
      "priority": "high/medium/low based on urgency and whether recipient is primary",
      "importance": "urgent/standard/optional based on business impact and necessity",
      "fromToday": true/false,
      "taskMentionedDate": "YYYY-MM-DD format of when this task was mentioned in the email",
      "isCompleted": true/false,
      "completionEvidence": "If isCompleted=true, quote the text showing it's completed",
      "hasPassedDeadline": true/false,
      "deadlineStatus": "Explanation of deadline status if applicable"
    }
  ],
  "reasoning": "Brief explanation of your overall analysis of this email"
}

For the dueDate field, convert relative dates (like "tomorrow", "next week", "Thursday") to actual dates based on today's date provided above.

IMPORTANT: Create ONLY ONE TASK per email or email chain. If there are multiple actions needed, combine them into a single comprehensive task or select only the most important one.
`;

  // Log the full prompt for debugging
  Logger.log("=== OPENAI PROMPT ===");
  Logger.log(prompt);
  Logger.log("=== END PROMPT ===");

  try {
    Logger.log(`Sending prompt to OpenAI for email: ${messageId}`);
    const response = callOpenAI(prompt);
    Logger.log("API Response received");
    Logger.log("=== RAW OPENAI RESPONSE ===");
    Logger.log(response);
    Logger.log("=== END RAW RESPONSE ===");

    // Try to parse the JSON
    try {
      const jsonMatch = response.match(/{[\s\S]*}/);
      if (jsonMatch) {
        const parsedJson = JSON.parse(jsonMatch[0]);
        Logger.log(
          `Extracted ${
            parsedJson.tasks ? parsedJson.tasks.length : 0
          } potential tasks`
        );
        Logger.log("=== PARSED JSON ===");
        Logger.log(JSON.stringify(parsedJson, null, 2));
        Logger.log("=== END PARSED JSON ===");

        // Check if there are tasks to process
        if (parsedJson.isAutomated === true) {
          Logger.log(`Skipping automated email: ${parsedJson.automatedReason}`);
        } else if (parsedJson.tasks && parsedJson.tasks.length > 0) {
          // Get default task list once
          try {
            Logger.log("Retrieving Google Tasks lists");
            const taskLists = Tasks.Tasklists.list().items;
            Logger.log(`Found ${taskLists.length} task lists`);
            Logger.log(
              `Using task list: ${taskLists[0].title} (${taskLists[0].id})`
            );
            const taskList = taskLists[0].id; // Use the first task list (default)

            let createdTaskCount = 0;
            let createdTaskTitles = [];

            // Process each task in the array
            for (const taskData of parsedJson.tasks) {
              Logger.log(`Processing task: "${taskData.taskTitle}"`);
              Logger.log(`Create flag: ${taskData.createTask}`);
              Logger.log(`Due date: ${taskData.dueDate || "None"}`);
              Logger.log(`Priority: ${taskData.priority || "Not specified"}`);
              Logger.log(`Importance: ${taskData.importance || "standard"}`);
              Logger.log(
                `From today: ${taskData.fromToday === false ? "NO" : "Yes"}`
              );
              Logger.log(
                `Task mentioned date: ${
                  taskData.taskMentionedDate || "Not specified"
                }`
              );
              Logger.log(
                `Is completed: ${taskData.isCompleted === true ? "YES" : "No"}`
              );
              Logger.log(
                `Has passed deadline: ${
                  taskData.hasPassedDeadline === true ? "YES" : "No"
                }`
              );

              // Get today's date in YYYY-MM-DD format for comparison
              const todayFormatted = Utilities.formatDate(
                now,
                Session.getScriptTimeZone(),
                "yyyy-MM-dd"
              );

              // Skip tasks that are explicitly marked as not from today
              if (taskData.fromToday === false) {
                Logger.log(`Skipping task - not from today's communication`);
                continue;
              }

              // Skip tasks with a mentioned date that isn't today
              if (
                taskData.taskMentionedDate &&
                taskData.taskMentionedDate !== todayFormatted
              ) {
                Logger.log(
                  `Skipping task - mentioned on ${taskData.taskMentionedDate}, not today (${todayFormatted})`
                );
                continue;
              }

              // Skip tasks that are already completed
              if (taskData.isCompleted === true) {
                Logger.log(
                  `Skipping task - already completed: ${
                    taskData.completionEvidence || "No evidence provided"
                  }`
                );
                continue;
              }

              // Skip tasks with passed deadlines
              if (taskData.hasPassedDeadline === true) {
                Logger.log(
                  `Skipping task - deadline has passed: ${
                    taskData.deadlineStatus || "No status provided"
                  }`
                );
                continue;
              }

              if (taskData.createTask === true) {
                // Prepare due date if provided
                let due = null;
                if (taskData.dueDate && taskData.dueDate.trim() !== "") {
                  try {
                    const dueDate = new Date(taskData.dueDate);
                    // Format for Tasks API (RFC 3339 timestamp)
                    due = dueDate.toISOString();
                    Logger.log(`Due date formatted for API: ${due}`);
                  } catch (e) {
                    Logger.log(`Invalid due date format: ${taskData.dueDate}`);
                    Logger.log(`Error details: ${e.toString()}`);
                  }
                }

                // Prepare task title with importance prefix
                let taskTitle = taskData.taskTitle;
                if (taskData.importance) {
                  if (taskData.importance.toLowerCase() === "urgent") {
                    taskTitle = "URGENT: " + taskTitle;
                  } else if (taskData.importance.toLowerCase() === "optional") {
                    taskTitle = "OPTIONAL: " + taskTitle;
                  }
                  // Don't add prefix for "standard" importance
                }

                // Create the task
                const task = {
                  title: taskTitle,
                  notes:
                    taskData.taskDetails + "\n\nCreated from email: " + subject,
                  due: due,
                };

                Logger.log("Attempting to create task with data:");
                Logger.log(JSON.stringify(task, null, 2));

                // Insert the task into Google Tasks
                try {
                  const createdTask = Tasks.Tasks.insert(task, taskList);
                  Logger.log("Task created successfully:");
                  Logger.log(JSON.stringify(createdTask, null, 2));

                  createdTaskCount++;
                  createdTaskTitles.push(taskData.taskTitle);
                } catch (taskInsertError) {
                  Logger.log(
                    `Failed to create task: ${taskInsertError.toString()}`
                  );
                  Logger.log(`Task data: ${JSON.stringify(task, null, 2)}`);
                }
              } else {
                Logger.log("Task not flagged for creation, skipping");
              }
            }

            if (createdTaskCount > 0) {
              Logger.log(
                `Created ${createdTaskCount} tasks: ${createdTaskTitles.join(
                  ", "
                )}`
              );
            } else {
              Logger.log("No tasks were flagged for creation");
            }
          } catch (tasksError) {
            Logger.log(`Error accessing Tasks API: ${tasksError.toString()}`);
            Logger.log(
              `Stack trace: ${tasksError.stack || "No stack trace available"}`
            );
          }
        } else {
          Logger.log("No tasks to create: " + parsedJson.reasoning);
        }
      } else {
        Logger.log("Could not parse JSON from LLM response");
        Logger.log("Response format did not match expected JSON structure");
      }
    } catch (jsonError) {
      Logger.log(`Error parsing JSON response: ${jsonError.toString()}`);
      Logger.log(
        `Error stack: ${jsonError.stack || "No stack trace available"}`
      );
      // Log the actual response to help debug
      Logger.log(`Raw response again for reference: ${response}`);
    }
  } catch (e) {
    Logger.log(`Error during API processing: ${e.toString()}`);
    Logger.log(`Error stack: ${e.stack || "No stack trace available"}`);
  }

  Logger.log(`=== FINISHED PROCESSING EMAIL: "${subject}" ===`);
}

/**
 * Check if an email address belongs to the user
 */
function isUserEmail(email, userEmail) {
  return email.toLowerCase().indexOf(userEmail.toLowerCase()) > -1;
}

/**
 * Check if the user is among the recipients
 */
function isUserRecipient(recipients, userEmail) {
  return recipients.toLowerCase().indexOf(userEmail.toLowerCase()) > -1;
}

/**
 * Get the user's email address - Deprecated, use getUserInfo() instead
 */
function getUserEmail() {
  try {
    return Session.getEffectiveUser().getEmail();
  } catch (e) {
    Logger.log(`Error getting user email: ${e.toString()}`);
    throw e;
  }
}

/**
 * Test function to check Gmail access
 */
function testGmailAccess() {
  try {
    // Attempt to get unread count
    const unreadCount = GmailApp.getInboxUnreadCount();
    Logger.log(`Successfully accessed Gmail. Unread count: ${unreadCount}`);

    // Try to get some recent threads
    const recentThreads = GmailApp.getInboxThreads(0, 5);
    Logger.log(`Found ${recentThreads.length} recent inbox threads`);

    if (recentThreads.length > 0) {
      // Log details of the first thread
      const firstThread = recentThreads[0];
      const messages = firstThread.getMessages();
      const lastMessage = messages[messages.length - 1];
      Logger.log(`Most recent thread subject: "${lastMessage.getSubject()}"`);
      Logger.log(`From: ${lastMessage.getFrom()}`);
      Logger.log(`Received: ${lastMessage.getDate()}`);
    }

    return "Gmail access test successful";
  } catch (error) {
    Logger.log(`Error accessing Gmail: ${error.toString()}`);
    return `Error: ${error.toString()}`;
  }
}

/**
 * Test direct Gmail search
 */
function testGmailSearch() {
  // Search for emails from today
  const today = new Date();
  const formattedDate = Utilities.formatDate(
    today,
    Session.getScriptTimeZone(),
    "yyyy/MM/dd"
  );

  const searchQuery = `after:${formattedDate}`;
  Logger.log(`Searching with query: ${searchQuery}`);

  const threads = GmailApp.search(searchQuery, 0, 10);
  Logger.log(`Found ${threads.length} threads from today`);

  if (threads.length > 0) {
    // Log details of found threads
    for (let i = 0; i < threads.length && i < 3; i++) {
      const thread = threads[i];
      const messages = thread.getMessages();
      const latestMessage = messages[messages.length - 1];
      Logger.log(`Thread ${i + 1}: "${latestMessage.getSubject()}"`);
      Logger.log(`  From: ${latestMessage.getFrom()}`);
      Logger.log(`  To: ${latestMessage.getTo() || "N/A"}`);
      Logger.log(`  Date: ${latestMessage.getDate()}`);
    }
  }

  return `Found ${threads.length} threads from today`;
}

/**
 * Get the user's information (email and name)
 * @returns {Object} Object containing user's email and name
 */
function getUserInfo() {
  try {
    // First try to get user information from People API
    try {
      // Get the user's email
      const email = Session.getEffectiveUser().getEmail();

      // Use People API to get more user information
      const people = People.People.get("people/me", {
        personFields: "names,emailAddresses",
      });

      // Extract the display name from the response
      let displayName = "";
      if (people.names && people.names.length > 0) {
        displayName =
          people.names[0].displayName ||
          people.names[0].givenName ||
          email.split("@")[0];
      } else {
        // Fallback if names not available
        displayName = email.split("@")[0];
        // Convert to title case
        displayName =
          displayName.charAt(0).toUpperCase() + displayName.slice(1);
      }

      Logger.log(`Found user info - Email: ${email}, Name: ${displayName}`);
      return {
        email: email,
        name: displayName,
      };
    } catch (peopleError) {
      Logger.log(`Could not access People API: ${peopleError.toString()}`);
      throw peopleError; // Propagate the error to try Session method
    }
  } catch (e) {
    // Try to get just the email if People API failed
    try {
      const email = Session.getEffectiveUser().getEmail();
      const namePart = email.split("@")[0];

      // Basic capitalization
      const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

      Logger.log(
        `Derived user info from Session - Email: ${email}, Name: ${displayName}`
      );
      return {
        email: email,
        name: displayName,
      };
    } catch (sessionError) {
      // If all else fails, log the error and let caller handle
      Logger.log(`Error getting user info: ${sessionError.toString()}`);
      throw sessionError;
    }
  }
}

/**
 * Calls the configured LLM API (e.g., OpenAI or Anthropic)
 * Assumes API key and endpoint are configured elsewhere (e.g., Script Properties)
 * IMPORTANT: Replace this with your actual LLM API call implementation.
 */
function callOpenAI(prompt) {
  // Placeholder implementation - Replace with your actual API call logic
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY"); // Or ANTHROPIC_API_KEY etc.
  const apiEndpoint = "YOUR_LLM_API_ENDPOINT"; // e.g., https://api.openai.com/v1/chat/completions or Anthropic endpoint

  if (!apiKey) {
    throw new Error("LLM API key not found in Script Properties.");
  }
  if (apiEndpoint === "YOUR_LLM_API_ENDPOINT") {
     throw new Error("LLM API endpoint not configured in the script.");
  }


  // Example using UrlFetchApp for OpenAI Chat Completion (adjust model as needed)
  const payload = {
    model: "gpt-4.1", // Or "claude-3-5-sonnet-20240620" for Anthropic etc. Use correct model name.
    messages: [{ role: "user", content: prompt }],
    // Add other parameters like temperature, max_tokens as needed
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true, // Important to handle errors manually
  };

  try {
    const response = UrlFetchApp.fetch(apiEndpoint, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      const jsonResponse = JSON.parse(responseBody);
      // Extract the actual response text based on the API structure
      // For OpenAI chat completions:
      if (jsonResponse.choices && jsonResponse.choices.length > 0) {
        return jsonResponse.choices[0].message.content;
      } else {
         throw new Error("LLM API response format unexpected (no choices found).");
      }
       // For Anthropic: Adjust based on their response structure (e.g., jsonResponse.content[0].text)
    } else {
      Logger.log(`LLM API Error - Code: ${responseCode}, Body: ${responseBody}`);
      throw new Error(`LLM API request failed with status ${responseCode}: ${responseBody}`);
    }
  } catch (fetchError) {
    Logger.log(`Error calling LLM API: ${fetchError.toString()}`);
    throw fetchError; // Re-throw to be caught by the caller
  }
}
