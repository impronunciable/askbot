
/**
 * Module dependencies
 */

const http = require('http');
const Bot = require('messenger-bot');
const request = require('axios');
const config = require('./config.json');

/**
 * Module scope variables
 */

const users = {};
let forms = [];

const FORMS_URL = config.pillarURL;
const FB_TOKEN = config.fbToken;
const FB_VERIFY_TOKEN = config.fbVerifyToken;
const FB_SECRET = config.fbSecret;

/**
 * Get forms
 */

request(FORMS_URL)
.then(res => forms = res.data.filter(form => form.steps[0].widgets.length))
.then(() => console.log('Got form list'))
.catch(err => console.log(err))

/**
 * Initialize the bot
 */

let bot = new Bot({ token: FB_TOKEN, verify: FB_VERIFY_TOKEN, app_secret: FB_SECRET });

/**
 * Bot handlers
 */

bot.on('error', err => console.log(err.message));

bot.on('postback', (payload, reply) => {
  const userId = payload.sender.id;
  const text = payload.postback.payload;
  console.log(userId, text, 'postback')
  getAnswerAndReply(userId, text, reply);
});

bot.on('message', (payload, reply) => {

  console.log('Incoming message');


  const text = payload.message.text;
  const userId = payload.sender.id;
  const user = users[userId];


  // User is not answering a form and ask to do it
  if (!user && /ask me/gi.test(text)) {
    return reply(startForm(userId, text));
  } else if(!user) {
    console.log('New user that didn\'t ask for a new form. Adding suggestion');
    return reply({ text: 'Hi! you can start getting questions by saying "ask me"'});
  } else {
    // New incoming answer!
    getAnswerAndReply(userId, text, reply);
  }
});

/**
 * Starts a new form
 */

const startForm = (userId, text) => {
  console.log(`${userId} wants to start a new submission`);

  // Get a Random Form
  const formId = Math.floor(Math.random() * (forms.length - 1)); 
  const form = forms[formId];

  // Setup the user object for the form
  users[userId] = { id: form.id, answers: [], questions: form.steps[0].widgets, saveDestination: form.settings.saveDestination };

  const prefix =
`You are about to answer some questions about "${form.header.heading || form.header.title}".
Lets start with the first one:`;
  return renderNextQuestion(userId, prefix);
};

const renderNextQuestion = (uid, prefix = '') => {
  const user = users[uid];
  const question = user.questions[user.answers.length];
  if (question.component === 'MultipleChoice') {
    console.log(question.props)
    return {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: `${prefix ? prefix + '\n': ''}${question.title}${question.description ? ': ' : ''}${question.description || ''}`,
          buttons: question.props.options.map(option => ({ title: option.title, payload: option.title, type: 'postback' })).filter((t, i) => i <= 2)
        }    
      }
    };
  } else {
    return { text: `${prefix ? prefix + '\n': ''}${question.title}${question.description ? ': ' : ''}${question.description || ''}` }
  }
};

const getAnswerAndReply = (userId, text, reply) => {
  console.log('New incoming answer');

  // Push answer
  const user = users[userId];
  user.answers.push({ answer: text, widget_id: user.questions[user.answers.length].id });

  // If already got all answers, submit submission and thank the user
  if (user.answers.length >= user.questions.length) {
    console.log(`Saving submission into ${user.saveDestination}${user.id}`);
    const answers = user.answers;
    delete users[userId];
    return request.post(`${user.saveDestination}${user.id}`, answers, { timeout: 5000 })
      .then(() => reply({ text: 'Thanks for answering! ask me again if you want to answer more questions...' })).then(() => console.log('Submission successfully saved'))
      .catch(() => reply({ text: 'Thanks for answering! ask me again if you want to answer more questions...' })).then(() => console.log('Submission Failed :('));

    // Delete submission so we can start over
  } else {
    // Ask another question
    return reply(renderNextQuestion(userId));
  }
};

http.createServer(bot.middleware()).listen(process.env.PORT || 5000);
console.log('Echo bot server running at port ' + (process.env.PORT || 5000));

process.on('uncaughtException', err => {console.log(err)})
