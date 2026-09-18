const MAX_EMBED_BYTES = 8 * 1024 * 1024;

const urlCache = new Map();

async function urlToDataUri(url) {
  if (!url) return null;
  if (urlCache.has(url)) return urlCache.get(url);

  const result = await (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;

      const lengthHeader = res.headers.get('content-length');
      if (lengthHeader && Number(lengthHeader) > MAX_EMBED_BYTES) return null;

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_EMBED_BYTES) return null;

      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      return `data:${contentType};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  })();

  urlCache.set(url, result);
  return result;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function transformContent(content, message) {
  let text = escapeHtml(content || '');

  text = text.replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, code) => `<pre class="code-block">${code}</pre>`);
  text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<u>$1</u>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  text = text.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => {
    const user = message.mentions.users.get(id);
    return `<span class="mention">@${user ? escapeHtml(user.username) : 'unknown-user'}</span>`;
  });
  text = text.replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => {
    const role = message.mentions.roles.get(id);
    return `<span class="mention">@${role ? escapeHtml(role.name) : 'unknown-role'}</span>`;
  });
  text = text.replace(/&lt;#(\d+)&gt;/g, (_, id) => {
    const ch = message.mentions.channels.get(id);
    return `<span class="mention">#${ch ? escapeHtml(ch.name) : 'unknown-channel'}</span>`;
  });

  const emojiMatches = [...text.matchAll(/&lt;(a?):(\w+):(\d+)&gt;/g)];
  for (const [full, animated, name, id] of emojiMatches) {
    const ext = animated ? 'gif' : 'png';
    const dataUri = await urlToDataUri(`https://cdn.discordapp.com/emojis/${id}.${ext}`);
    const replacement = dataUri
      ? `<img class="emoji" alt=":${escapeHtml(name)}:" src="${dataUri}">`
      : `:${escapeHtml(name)}:`;
    text = text.replace(full, replacement);
  }

  text = text.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);

  text = text.replace(/\n/g, '<br>');

  return text;
}

async function renderAttachment(attachment) {
  const isImage = attachment.contentType?.startsWith('image/');
  const isVideo = attachment.contentType?.startsWith('video/');
  const isAudio = attachment.contentType?.startsWith('audio/');

  if (isImage) {
    const dataUri = await urlToDataUri(attachment.url);
    if (dataUri) {
      return `<a class="attachment-img-link" href="${dataUri}" target="_blank"><img class="attachment-img" src="${dataUri}" alt="${escapeHtml(attachment.name)}" loading="lazy"></a>`;
    }
  } else if (isVideo) {
    const dataUri = await urlToDataUri(attachment.url);
    if (dataUri) return `<video class="attachment-video" controls src="${dataUri}"></video>`;
  } else if (isAudio) {
    const dataUri = await urlToDataUri(attachment.url);
    if (dataUri) return `<audio class="attachment-audio" controls src="${dataUri}"></audio>`;
  }

  const dataUri = await urlToDataUri(attachment.url);
  const href = dataUri || attachment.url;
  return `<a class="file-chip" href="${href}" download="${escapeHtml(attachment.name)}">
    <span class="file-chip-icon">📎</span>
    <span class="file-chip-name">${escapeHtml(attachment.name)}</span>
    <span class="file-chip-size">${formatBytes(attachment.size)}</span>
  </a>`;
}

async function renderEmbed(embed) {
  const color = embed.hexColor || '#4f545c';
  let imageHtml = '';
  if (embed.image?.url) {
    const dataUri = await urlToDataUri(embed.image.url);
    if (dataUri) imageHtml = `<img class="embed-image" src="${dataUri}" loading="lazy">`;
  } else if (embed.thumbnail?.url) {
    const dataUri = await urlToDataUri(embed.thumbnail.url);
    if (dataUri) imageHtml = `<img class="embed-thumbnail" src="${dataUri}" loading="lazy">`;
  }

  return `<div class="embed" style="border-left-color:${color}">
    ${embed.author?.name ? `<div class="embed-author">${escapeHtml(embed.author.name)}</div>` : ''}
    ${embed.title ? `<div class="embed-title">${embed.url ? `<a href="${embed.url}" target="_blank">${escapeHtml(embed.title)}</a>` : escapeHtml(embed.title)}</div>` : ''}
    ${embed.description ? `<div class="embed-description">${escapeHtml(embed.description).replace(/\n/g, '<br>')}</div>` : ''}
    ${imageHtml}
    ${embed.footer?.text ? `<div class="embed-footer">${escapeHtml(embed.footer.text)}</div>` : ''}
  </div>`;
}

function renderReactions(message) {
  if (!message.reactions.cache.size) return '';
  const pills = [...message.reactions.cache.values()]
    .map((r) => `<span class="reaction-pill">${r.emoji.toString()} ${r.count}</span>`)
    .join('');
  return `<div class="reactions">${pills}</div>`;
}

function formatTimestamp(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeOnly(date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

async function buildArchiveHtml(channel, messages, onProgress) {
  const groups = [];
  let currentGroup = null;

  for (const message of messages) {
    const sameAuthor = currentGroup && currentGroup.authorId === message.author.id;
    const withinWindow =
      currentGroup && message.createdTimestamp - currentGroup.lastTimestamp < 7 * 60 * 1000;

    if (sameAuthor && withinWindow) {
      currentGroup.messages.push(message);
      currentGroup.lastTimestamp = message.createdTimestamp;
    } else {
      currentGroup = {
        authorId: message.author.id,
        author: message.author,
        member: message.member,
        lastTimestamp: message.createdTimestamp,
        messages: [message],
      };
      groups.push(currentGroup);
    }
  }

  const messageBlocks = [];
  let processed = 0;

  for (const group of groups) {
    const avatarUrl = group.author.displayAvatarURL({ extension: 'png', size: 128 });
    const avatarDataUri = (await urlToDataUri(avatarUrl)) || '';
    const displayName = group.member?.displayName || group.author.username;
    const roleColor = group.member?.displayHexColor && group.member.displayHexColor !== '#000000'
      ? group.member.displayHexColor
      : '#f2f3f5';

    const lineBlocks = [];
    for (const message of group.messages) {
      const contentHtml = await transformContent(message.content, message);
      const attachmentsHtml = (
        await Promise.all([...message.attachments.values()].map(renderAttachment))
      ).join('');
      const embedsHtml = (await Promise.all(message.embeds.map(renderEmbed))).join('');
      const reactionsHtml = renderReactions(message);
      const editedTag = message.editedTimestamp ? '<span class="edited-tag">(edited)</span>' : '';

      lineBlocks.push(`
        <div class="message-line">
          <span class="line-timestamp">${formatTimeOnly(message.createdAt)}</span>
          <div class="message-body">
            ${contentHtml ? `<div class="message-content">${contentHtml}${editedTag}</div>` : ''}
            ${attachmentsHtml ? `<div class="attachments">${attachmentsHtml}</div>` : ''}
            ${embedsHtml}
            ${reactionsHtml}
          </div>
        </div>
      `);
      processed += 1;
    }

    if (onProgress && processed % 200 < group.messages.length) {
      await onProgress(processed, messages.length);
    }

    messageBlocks.push(`
      <div class="message-group">
        <img class="avatar" src="${avatarDataUri}" alt="${escapeHtml(displayName)}">
        <div class="group-content">
          <div class="group-header">
            <span class="author-name" style="color:${roleColor}">${escapeHtml(displayName)}</span>
            <span class="group-timestamp">${formatTimestamp(group.messages[0].createdAt)}</span>
          </div>
          ${lineBlocks.join('')}
        </div>
      </div>
    `);
  }

  const guildName = channel.guild?.name || 'Direct Messages';
  const channelName = channel.name ? `#${channel.name}` : 'channel';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(guildName)} - ${escapeHtml(channelName)} Archive</title>
<style>
  :root {
    --bg-primary: #313338;
    --bg-secondary: #2b2d31;
    --text-normal: #dbdee1;
    --text-muted: #949ba4;
    --text-header: #f2f3f5;
    --interactive-hover: #35373c;
    --brand: #5865f2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg-primary);
    color: var(--text-normal);
    font-family: "gg sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
  }
  header.archive-header {
    background: var(--bg-secondary);
    padding: 16px 20px;
    border-bottom: 1px solid #1e1f22;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  header.archive-header h1 {
    margin: 0;
    font-size: 18px;
    color: var(--text-header);
  }
  header.archive-header p {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 13px;
  }
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 16px 20px 60px;
  }
  .message-group {
    display: flex;
    gap: 16px;
    padding: 10px 8px;
    border-radius: 6px;
  }
  .message-group:hover {
    background: var(--interactive-hover);
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #1e1f22;
  }
  .group-content { min-width: 0; flex: 1; }
  .group-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }
  .author-name { font-weight: 600; font-size: 15px; }
  .group-timestamp { font-size: 12px; color: var(--text-muted); }
  .message-line {
    display: flex;
    gap: 10px;
    position: relative;
  }
  .line-timestamp {
    width: 40px;
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-muted);
    opacity: 0;
    padding-top: 3px;
  }
  .message-line:hover .line-timestamp { opacity: 1; }
  .message-content {
    line-height: 1.375rem;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .edited-tag { font-size: 10px; color: var(--text-muted); margin-left: 4px; }
  .mention {
    background: rgba(88,101,242,0.3);
    color: #c9cdfb;
    padding: 0 2px;
    border-radius: 3px;
    font-weight: 500;
  }
  a { color: #00a8fc; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .inline-code {
    background: #2b2d31;
    padding: 2px 4px;
    border-radius: 4px;
    font-family: Consolas, Menlo, monospace;
    font-size: 0.85em;
  }
  .code-block {
    background: #2b2d31;
    padding: 10px;
    border-radius: 6px;
    font-family: Consolas, Menlo, monospace;
    font-size: 0.85em;
    overflow-x: auto;
    white-space: pre-wrap;
  }
  .emoji { width: 22px; height: 22px; vertical-align: middle; object-fit: contain; }
  .attachments {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .attachment-img, .attachment-video {
    max-width: 400px;
    max-height: 300px;
    border-radius: 8px;
    display: block;
    cursor: zoom-in;
  }
  .attachment-audio { width: 320px; }
  .file-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-secondary);
    border: 1px solid #3f4147;
    border-radius: 6px;
    padding: 8px 12px;
    max-width: 320px;
  }
  .file-chip-name { color: #00a8fc; font-size: 14px; }
  .file-chip-size { color: var(--text-muted); font-size: 12px; margin-left: auto; }
  .embed {
    margin-top: 6px;
    border-left: 4px solid #4f545c;
    background: var(--bg-secondary);
    border-radius: 4px;
    padding: 10px 12px;
    max-width: 480px;
  }
  .embed-author { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .embed-title { font-weight: 600; margin-bottom: 4px; }
  .embed-description { font-size: 14px; color: var(--text-normal); }
  .embed-image { max-width: 100%; border-radius: 4px; margin-top: 8px; }
  .embed-thumbnail { max-width: 80px; border-radius: 4px; float: right; }
  .embed-footer { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
  .reactions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
  .reaction-pill {
    background: var(--bg-secondary);
    border: 1px solid #3f4147;
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 13px;
  }
  #lightbox {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    align-items: center;
    justify-content: center;
    z-index: 1000;
    cursor: zoom-out;
  }
  #lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 4px; }
</style>
</head>
<body>
  <header class="archive-header">
    <h1>${escapeHtml(guildName)} / ${escapeHtml(channelName)}</h1>
    <p>Archived ${messages.length} messages on ${new Date().toLocaleString()}</p>
  </header>
  <main>
    ${messageBlocks.join('')}
  </main>
  <div id="lightbox"><img id="lightbox-img" src=""></div>
  <script>
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    document.querySelectorAll('.attachment-img-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        lightboxImg.src = link.getAttribute('href');
        lightbox.style.display = 'flex';
      });
    });
    lightbox.addEventListener('click', () => { lightbox.style.display = 'none'; });
  </script>
</body>
</html>`;
}

module.exports = { buildArchiveHtml };
