// Default Prompt Template
const DEFAULT_PROMPT = `
You are an expert content strategist and translator. Your goal is to synthesize the provided YouTube transcript into a high-value, professional summary that is both insightful and easy to digest.

### Executive Summary
Provide a compelling 2-3 sentence overview of the video's core thesis. What is the main argument, and why does it matter?

### Key Insights & Takeaways
Extract 5-10 distinct, actionable points. Focus on unique perspectives, specific data, or step-by-step instructions rather than generic fluff.

### Summarize for 6 year old audience 

**Format for each point:**
(Start-End) **[Topic/Heading]**: [Deep-dive summary of the point in English]
> *[Target Language Translation: Natural, professional, and context-aware]*
[Link to video at start time]

### Notable Quotes
Briefly list 1-2 standout quotes or surprising facts from the video.

---
**Video Metadata:**
- **Title**: "{{Title}}"
- **URL**: "{{URL}}"

**Transcript:**
"{{Transcript}}"
`;

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('resetPrompt').addEventListener('click', () => {
  document.getElementById('promptTemplate').value = DEFAULT_PROMPT;
});

function saveOptions() {
  const language = document.getElementById('language').value;
  const summaryStyle = document.getElementById('summaryStyle').value;
  const promptTemplate = document.getElementById('promptTemplate').value;

  chrome.storage.sync.set(
    {
      language: language,
      summaryStyle: summaryStyle,
      promptTemplate: promptTemplate
    },
    () => {
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      status.classList.add('success');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('success');
      }, 1500);
    }
  );
}

function restoreOptions() {
  chrome.storage.sync.get(
    {
      language: 'Vietnamese',
      summaryStyle: 'executive',
      promptTemplate: DEFAULT_PROMPT
    },
    (items) => {
      document.getElementById('language').value = items.language;
      document.getElementById('summaryStyle').value = items.summaryStyle;
      document.getElementById('promptTemplate').value = items.promptTemplate;
    }
  );
}
