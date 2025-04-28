function callOpenAI(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_KEY');
  const url = 'https://api.openai.com/v1/responses';
  const payload = {
    model: 'o1',
    input: prompt,
    reasoning: {
      effort: "high"
    }
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const resp = UrlFetchApp.fetch(url, options);
  const text = resp.getContentText();

  try {
    const data = JSON.parse(text);
    // Extract the text from the output structure specific to the responses API
    const outputText = data.output?.find(item => item.type === "message")?.content?.find(content => content.type === "output_text")?.text || "";
    return outputText.trim() || text;
  } catch (e) {
    // If parsing fails, return the raw JSON
    return text;
  }
}

/**
 * Test Gmail access with multiple search approaches
 * This function will try different search methods to verify Gmail access
 */
function diagnoseBrokenGmailAccess() {
  const logResults = [];
  function logAndCapture(message) {
    Logger.log(message);
    logResults.push(message);
  }

  try {
    // 1. Check basic Gmail access
    logAndCapture("--- TESTING BASIC GMAIL ACCESS ---");
    const unreadCount = GmailApp.getInboxUnreadCount();
    logAndCapture(`Inbox unread count: ${unreadCount}`);
    
    // 2. Get threads with different methods
    logAndCapture("\n--- TESTING INBOX THREADS ---");
    const inboxThreads = GmailApp.getInboxThreads(0, 5);
    logAndCapture(`Found ${inboxThreads.length} inbox threads`);
    
    if (inboxThreads.length > 0) {
      const firstInboxThread = inboxThreads[0];
      const messages = firstInboxThread.getMessages();
      logAndCapture(`First inbox thread subject: "${messages[0].getSubject()}"`);
    }
    
    // 3. Try different search queries
    logAndCapture("\n--- TESTING SEARCH QUERIES ---");
    
    // 3.1 Search for all emails
    const allEmailsQuery = "";
    const allEmails = GmailApp.search(allEmailsQuery, 0, 5);
    logAndCapture(`Search query: [${allEmailsQuery || "ALL EMAILS"}] returned ${allEmails.length} threads`);
    
    // 3.2 Search for today's emails
    const today = new Date();
    const todayFormatted = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy/MM/dd");
    const todayQuery = `after:${todayFormatted}`;
    const todayEmails = GmailApp.search(todayQuery, 0, 5);
    logAndCapture(`Search query: [${todayQuery}] returned ${todayEmails.length} threads`);
    
    // 3.3 Search for emails in the last week
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekFormatted = Utilities.formatDate(lastWeek, Session.getScriptTimeZone(), "yyyy/MM/dd");
    const weekQuery = `after:${lastWeekFormatted}`;
    const weekEmails = GmailApp.search(weekQuery, 0, 5);
    logAndCapture(`Search query: [${weekQuery}] returned ${weekEmails.length} threads`);
    
    // 3.4 Search with in:anywhere to include all mail
    const anywhereQuery = "in:anywhere";
    const anywhereEmails = GmailApp.search(anywhereQuery, 0, 5);
    logAndCapture(`Search query: [${anywhereQuery}] returned ${anywhereEmails.length} threads`);
    
    // 3.5 Search specifically for the test email address
    const userEmail = getUserEmail();
    const emailQuery = `to:${userEmail} OR from:${userEmail}`;
    const emailEmails = GmailApp.search(emailQuery, 0, 5);
    logAndCapture(`Search query: [${emailQuery}] returned ${emailEmails.length} threads`);
    
    // 4. Check available labels
    logAndCapture("\n--- CHECKING GMAIL LABELS ---");
    const labels = GmailApp.getUserLabels();
    logAndCapture(`Found ${labels.length} user labels`);
    
    // 5. Check if we're getting zero results for all searches
    if (allEmails.length === 0 && todayEmails.length === 0 && weekEmails.length === 0 && anywhereEmails.length === 0) {
      logAndCapture("\n⚠️ WARNING: All searches returned zero results. Possible reasons: empty account, permissions issue, or query problems.");
    }
    
    // 6. Log detailed information about a few threads if any were found
    const threadsToExamine = allEmails.length > 0 ? allEmails : 
                            todayEmails.length > 0 ? todayEmails :
                            weekEmails.length > 0 ? weekEmails : 
                            anywhereEmails.length > 0 ? anywhereEmails : [];
    
    if (threadsToExamine.length > 0) {
      logAndCapture("\n--- DETAILED THREAD INFORMATION ---");
      for (let i = 0; i < Math.min(3, threadsToExamine.length); i++) {
        const thread = threadsToExamine[i];
        const messages = thread.getMessages();
        const lastMessage = messages[messages.length - 1];
        
        logAndCapture(`\nThread ${i+1}:`);
        logAndCapture(`Subject: "${lastMessage.getSubject()}"`);
        logAndCapture(`From: ${lastMessage.getFrom()}`);
        logAndCapture(`To: ${lastMessage.getTo() || "N/A"}`);
        logAndCapture(`Date: ${lastMessage.getDate()}`);
        logAndCapture(`Message Count: ${messages.length}`);
        
        // Test if we can access the body
        try {
          const bodySnippet = lastMessage.getPlainBody().substring(0, 50) + "...";
          logAndCapture(`Body snippet: "${bodySnippet}"`);
        } catch (e) {
          logAndCapture(`Could not access body: ${e.toString()}`);
        }
      }
    }
    
    return logResults.join("\n");
  } catch (error) {
    logAndCapture(`\n❌ ERROR: ${error.toString()}`);
    return logResults.join("\n");
  }
}

/**
 * Test function to send a test email to yourself
 * This can help verify that Gmail operations are working
 */
function sendTestEmailToSelf() {
  try {
    const userEmail = getUserEmail();
    const subject = "Test Email for Gmail Task Extraction - " + new Date().toISOString();
    const body = "This is a test email to verify that the Gmail Task Extraction app is working properly.\n\n" +
                "Here are some sample tasks that should be detected:\n\n" +
                "1. Review the Q1 report by Friday\n" +
                "2. Schedule meeting with marketing team\n" +
                "3. Respond to client inquiry about project timeline\n\n" +
                "This email was sent at: " + new Date().toString();
    
    GmailApp.sendEmail(userEmail, subject, body);
    Logger.log(`Test email sent to ${userEmail}`);
    return "Test email sent successfully. Please wait a minute and then run processEmails()";
  } catch (e) {
    Logger.log(`Error sending test email: ${e.toString()}`);
    return `Error: ${e.toString()}`;
  }
}