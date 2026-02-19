const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const queues = {};
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getKey(channel, threadTs) {
  return `${channel}-${threadTs}`;
}

function getQueue(channel, threadTs) {
  const key = getKey(channel, threadTs);

  if (!queues[key]) {
    queues[key] = {
      queue: [],
      current: null,
      timeout: null,
    };
  }

  return queues[key];
}

function clearTimeoutIfExists(queue) {
  if (queue.timeout) {
    clearTimeout(queue.timeout);
    queue.timeout = null;
  }
}

async function startTimeout(queue, channel, threadTs, client) {
  clearTimeoutIfExists(queue);

  queue.timeout = setTimeout(async () => {
    if (!queue.current) return;

    const skippedUser = queue.current;
    queue.queue.shift();

    if (queue.queue.length > 0) {
      queue.current = queue.queue[0];

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `⏰ <@${skippedUser}> timed out (30 mins).\n🔔 <@${queue.current}> it's your turn!`
      });

      startTimeout(queue, channel, threadTs, client);
    } else {
      queue.current = null;

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `⏰ <@${skippedUser}> timed out.\nQueue is now empty.`
      });
    }
  }, TIMEOUT_MS);
}

function queueBlocks() {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Thread Queue Controls*\nClick to join or mark done."
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "➕ Join Queue" },
          action_id: "join_queue",
          style: "primary"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Done" },
          action_id: "done_queue",
          style: "danger"
        }
      ]
    }
  ];
}

// --------------------------------------------------
// MESSAGE SHORTCUT HANDLER
// --------------------------------------------------
app.shortcut('start_queue_shortcut', async ({ shortcut, ack, client }) => {
  await ack();

  const channel = shortcut.channel.id;

  // If already in thread, use thread_ts
  const threadTs =
    shortcut.message.thread_ts || shortcut.message.ts;

  getQueue(channel, threadTs);

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: "🎟 Queue started for this thread.",
    blocks: queueBlocks()
  });
});

// --------------------------------------------------
// JOIN BUTTON
// --------------------------------------------------
app.action("join_queue", async ({ body, ack, client }) => {
  await ack();

  const channel = body.channel.id;
  const threadTs = body.message.thread_ts;
  const user = body.user.id;

  const queue = getQueue(channel, threadTs);

  if (queue.queue.includes(user)) return;

  queue.queue.push(user);

  if (!queue.current) {
    queue.current = user;

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `🎉 <@${user}> it's your turn!`
    });

    startTimeout(queue, channel, threadTs, client);
  }
});

// --------------------------------------------------
// DONE BUTTON
// --------------------------------------------------
app.action("done_queue", async ({ body, ack, client }) => {
  await ack();

  const channel = body.channel.id;
  const threadTs = body.message.thread_ts;
  const user = body.user.id;

  const queue = getQueue(channel, threadTs);

  if (queue.current !== user) return;

  clearTimeoutIfExists(queue);
  queue.queue.shift();

  if (queue.queue.length > 0) {
    queue.current = queue.queue[0];

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `✅ <@${user}> is done.\n🔔 <@${queue.current}> it's your turn!`
    });

    startTimeout(queue, channel, threadTs, client);
  } else {
    queue.current = null;

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `✅ <@${user}> is done.\nQueue is now empty.`
    });
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Thread queue shortcut bot running');
})();