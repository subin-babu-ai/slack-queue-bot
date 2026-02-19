const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const queues = {};

app.command('/queue', async ({ command, ack, respond }) => {
  await ack();

  const args = command.text.split(" ");
  const action = args[0];
  const channel = command.channel_id;
  const user = command.user_id;

  if (!queues[channel]) {
    queues[channel] = { queue: [], current: null };
  }

  const queue = queues[channel];

  if (action === "join") {
    if (queue.queue.includes(user)) {
      return respond("You're already in the queue.");
    }

    queue.queue.push(user);

    if (!queue.current) {
      queue.current = user;
      return respond(`<@${user}> it's your turn! 🎉`);
    }

    return respond(`You're #${queue.queue.length} in the queue.`);
  }

  if (action === "done") {
    if (queue.current !== user) {
      return respond("You're not the current person.");
    }

    queue.queue.shift();

    if (queue.queue.length > 0) {
      queue.current = queue.queue[0];
      await respond(`✅ <@${user}> is done.`);
      await app.client.chat.postMessage({
        channel,
        text: `🔔 <@${queue.current}> it's your turn!`
      });
    } else {
      queue.current = null;
      await respond("Queue is now empty.");
    }
  }

  if (action === "list") {
    if (queue.queue.length === 0) {
      return respond("Queue is empty.");
    }

    let text = "*Current Queue:*\n";
    queue.queue.forEach((u, i) => {
      text += `${i + 1}. <@${u}>\n`;
    });

    return respond(text);
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Queue bot running');
})();