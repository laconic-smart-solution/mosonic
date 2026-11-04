const fs = require('fs');
const data = JSON.parse(fs.readFileSync('D:/Projects/work/neutral-tex/server/_chat-session-dump.json', 'utf8'));
const msgs = data.messages;
console.log('count', msgs.length, 'roles', [...new Set(msgs.map(m => m.role))]);
// Print condensed transcript focusing on user + assistant text + tool names
for (const m of msgs) {
  const ts = m.createdAt;
  if (m.role === 'user') {
    console.log(`\n### USER ${ts}\n${(m.content || '').slice(0, 1500)}`);
  } else if (m.role === 'assistant') {
    let tools = [];
    if (Array.isArray(m.toolCalls)) tools = m.toolCalls.map(t => t?.function?.name || t?.name || JSON.stringify(t).slice(0,80));
    else if (m.toolCalls && typeof m.toolCalls === 'object') {
      // maybe prisma Json
      const tc = m.toolCalls;
      if (Array.isArray(tc)) tools = tc.map(t => t?.function?.name || t?.name || '?');
      else tools = [JSON.stringify(tc).slice(0, 200)];
    }
    const c = (m.content || '').slice(0, 1200);
    console.log(`\n### ASSISTANT ${ts}${tools.length ? ' tools=' + tools.join(',') : ''}\n${c}`);
  } else if (m.role === 'tool') {
    console.log(`\n### TOOL ${ts} name=${m.toolName || m.name} id=${m.toolCallId || ''}\n${(m.content || '').slice(0, 800)}`);
  } else {
    console.log(`\n### ${m.role} ${ts}\n${(m.content || '').slice(0, 500)}`);
  }
}
