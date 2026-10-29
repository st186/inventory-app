// Each role's chapters for Learn the app (learn.ts). A chapter is a short piece of the working day
// the person does with their own fingers: steps light up one part at a time, and they press it
// ("tap"), type in it ("do"), or read about it (no act). `go` opens a screen first; `close` shuts an
// open sheet first. Chapter 1 runs on the real app and only opens screens; the rest run on
// practice data (practice: true).
//
// The practice data (gallery/guidePreview/mock.ts) is what the steps expect: the opening checklist
// with 5 of 12 ticked, a delivery on the way, the flagged tandoori masala, tomorrow's request not
// sent, and so on. Change one, check the other (scripts: the lesson runner in the guide sources).
import { two, type Two } from './learn';
import { button, field, filled, input, section, text, topSheet, tour, type Find, type Words } from './find';
import { translate, type I18nKey } from '../../utils/i18n';

export type LessonStep = {
  id: string;
  /** Open this screen first (a route path, e.g. "money/expenses"). */
  go?: string;
  /** Shut the open sheet first. */
  close?: boolean;
  find?: Find;
  act?: 'tap' | 'do';
  ready?: () => boolean;
  optional?: boolean;
  /** How long to look for the part, in ms (default 6 s: screens load after a tap). */
  wait?: number;
  title: Two;
  body: Two;
};
export type Chapter = { id: string; title: Two; about: Two; minutes: number; practice: boolean; steps: LessonStep[] };

const sheet = { sheet: true };
// A label in English and Bengali, from the app's own words (the crew practise on Bengali screens).
const k = (...keys: I18nKey[]): Words => keys.flatMap((key) => [translate('en', key), translate('bn', key)]);
const q = (selector: string): Find => () => document.querySelector(selector);

// Chapter 1 for every role: the tabs, the bell and the account, on the real app.
function findYourWay(tabs: { path: string; title: Two; say: Two }[], extra: LessonStep[] = []): Chapter {
  return {
    id: 'find-your-way', practice: false, minutes: 1,
    title: two('Find your way', 'অ্যাপে পথ চেনা'),
    about: two('The tabs, notifications and your account.', 'ট্যাব, নোটিফিকেশন আর আপনার অ্যাকাউন্ট।'),
    steps: [
      { id: 'hello', title: two('Learn by doing', 'নিজে করে শিখুন'), body: two('This time you press the buttons yourself. Tap the lit-up part each time. Nothing changes in your app.', 'এবার বোতাম আপনি নিজেই চাপবেন। প্রতিবার আলো জ্বলা জায়গায় চাপুন। আপনার অ্যাপে কিছু বদলাবে না।') },
      ...tabs.map((t): LessonStep => ({ id: `tab-${t.path}`, find: tour(`tab-${t.path}`), act: 'tap', title: t.title, body: t.say })),
      { id: 'home', find: tour('tab-home'), act: 'tap', title: two('Back to Home', 'আবার Home-এ'), body: two('Home lists today\'s jobs in order, each with its time. Start every day here.', 'Home-এ আজকের কাজ পরপর, সময়সহ। রোজ এখান থেকেই শুরু করুন।') },
      { id: 'inbox', find: tour('inbox'), act: 'tap', title: two('Notifications', 'নোটিফিকেশন'), body: two('Tap the bell. New requests, reminders and approvals come here; the red number is how many are new.', 'ঘণ্টায় চাপুন। নতুন রিকোয়েস্ট, মনে করানো আর মঞ্জুরি এখানে আসে; লাল সংখ্যা মানে কতগুলো নতুন।') },
      { id: 'inbox-back', find: tour('tab-home'), act: 'tap', title: two('Newest on top', 'নতুনটা সবার ওপরে'), body: two('Tap one to open what it is about. Now tap Home to go back.', 'যেটায় চাপবেন, সেই কাজটা খুলবে। এবার Home চেপে ফিরে যান।') },
      { id: 'account', find: tour('account'), act: 'tap', title: two('Your account', 'আপনার অ্যাকাউন্ট'), body: two('Tap your initials: the app\'s language (বাংলা or English), a dark screen, and your password.', 'আপনার নামের অক্ষরে চাপুন: অ্যাপের ভাষা (বাংলা বা English), অন্ধকার স্ক্রিন আর পাসওয়ার্ড।') },
      { id: 'account-look', find: () => topSheet(), title: two('Language and screen', 'ভাষা আর স্ক্রিন'), body: two('Change the language here any time. Bunny\'s language (for speaking) is separate.', 'ভাষা এখানে যখন খুশি বদলান। বানির সঙ্গে কথা বলার ভাষা আলাদা।') },
      ...extra,
      { id: 'done', close: true, title: two('That\'s the map', 'এই হল অ্যাপের ম্যাপ'), body: two('Next, practise a real day on made-up data: every button works and nothing is saved.', 'এবার বানানো হিসাবে একটা আসল দিনের কাজ অভ্যাস করুন: সব বোতাম চলে, কিছুই সেভ হয় না।') },
    ],
  };
}

const STORE_INCHARGE: Chapter[] = [
  findYourWay(
    [
      { path: 'stock', title: two('Tap Stock', 'Stock চাপুন'), say: two('Tomorrow\'s stock request, deliveries coming in, and anything out of stock.', 'কালকের স্টক রিকোয়েস্ট, আসা ডেলিভারি, আর যা শেষ হয়ে গেছে।') },
      { path: 'money', title: two('Tap Money', 'Money চাপুন'), say: two('Close the day after closing, and add every expense.', 'বন্ধের পর দিনের হিসাব, আর প্রতিটা খরচ লেখা।') },
      { path: 'team', title: two('Tap Team', 'Team চাপুন'), say: two('Your crew\'s timesheets and leave to approve, and their workplace photos.', 'স্টাফদের টাইমশিট আর ছুটি মঞ্জুর, আর ওদের কাজের জায়গার ছবি।') },
      { path: 'me', title: two('Tap Me', 'Me চাপুন'), say: two('Your KPIs, attendance and leave, the photo guide, emergency numbers, and Learn the app.', 'আপনার KPI, হাজিরা আর ছুটি, ছবির নিয়ম, জরুরি নম্বর, আর Learn the app।') },
    ],
    [{ id: 'bunny', close: true, find: tour('ask-bunny'), optional: true, title: two('Ask Bunny', 'বানিকে জিজ্ঞেস করুন'), body: two('Stuck on a screen? Ask Bunny in plain words, Bengali is fine. It explains what you are looking at.', 'কোনো স্ক্রিনে আটকে গেলে বানিকে সহজ কথায় জিজ্ঞেস করুন, বাংলায় চলবে। যা দেখছেন তা বুঝিয়ে দেবে।') }],
  ),
  {
    id: 'shift', practice: true, minutes: 1,
    title: two('Start your shift', 'শিফট শুরু'),
    about: two('Check in when you reach the store; it is your attendance.', 'দোকানে পৌঁছে চেক-ইন; এটাই আপনার হাজিরা।'),
    steps: [
      { id: 'card', go: 'home', find: tour('shift'), title: two('Your shift', 'আপনার শিফট'), body: two('Your hours today and whether you have started. Practice: made-up data, nothing is saved.', 'আজকের সময় আর শিফট শুরু হয়েছে কিনা। অভ্যাস: বানানো হিসাব, কিছু সেভ হয় না।') },
      { id: 'start', find: button('Start shift'), act: 'tap', title: two('Tap Start shift', 'Start shift চাপুন'), body: two('Do this when you reach the store. The phone checks you are at the store, so allow location if asked.', 'দোকানে পৌঁছেই চাপুন। ফোন দেখে নেয় আপনি দোকানে আছেন কিনা, তাই লোকেশন চাইলে Allow দিন।') },
      { id: 'on', find: tour('shift'), title: two('You are on shift', 'শিফট চলছে'), body: two('The start time is your attendance. Late by more than 10 minutes counts against your KPI.', 'শুরুর সময়টাই আপনার হাজিরা। ১০ মিনিটের বেশি দেরি হলে KPI-তে কাটে।') },
      { id: 'end', find: button('End shift'), title: two('End shift at closing', 'বন্ধের সময় End shift'), body: two('After the day close, tap End shift before you leave. Forgetting it leaves your day open.', 'দিনের হিসাবের পর, বেরোনোর আগে End shift চাপুন। ভুলে গেলে দিনটা খোলা থেকে যায়।') },
    ],
  },
  {
    id: 'opening', practice: true, minutes: 1,
    title: two('Opening checklist', 'দোকান খোলার চেকলিস্ট'),
    about: two('Tick each thing as it gets ready, by 4 PM.', 'প্রতিটা জিনিস তৈরি হলেই টিক, বিকেল ৪টের মধ্যে।'),
    steps: [
      { id: 'card', go: 'home', find: tour('opening'), title: two('Opening checklist', 'দোকান খোলার চেকলিস্ট'), body: two('Oil, sauces, POS, fryer and the rest. It must be done by 4 PM; the owner sees what was ticked and when.', 'তেল, সস, POS, ফ্রায়ার ইত্যাদি। বিকেল ৪টের মধ্যে শেষ করতে হবে; কে কখন টিক দিল, মালিক দেখতে পান।') },
      { id: 'open', find: button('Open the checklist'), act: 'tap', title: two('Tap Open the checklist', 'Open the checklist চাপুন'), body: two('The list opens.', 'লিস্টটা খুলবে।') },
      { id: 'tick1', find: button('Laptop and POS machine set', sheet), act: 'tap', title: two('Tick what is ready', 'যা তৈরি, টিক দিন'), body: two('The laptop and POS are set: tap the line to tick it.', 'ল্যাপটপ আর POS সেট হয়ে গেছে: লাইনে চেপে টিক দিন।') },
      { id: 'tick2', find: button('Lights, fans, tables', sheet), act: 'tap', title: two('One more', 'আরও একটা'), body: two('Tick as soon as each thing is ready, not all at 4 PM: the time of each tick is kept.', 'প্রতিটা তৈরি হলেই টিক দিন, বিকেল ৪টেয় একসাথে নয়: প্রতিটা টিকের সময় থেকে যায়।') },
      { id: 'count', find: text('of 12 ready', sheet), title: two('It counts as you go', 'সঙ্গে সঙ্গে গোনা হয়'), body: two('Ticked by mistake? Tap it again to untick.', 'ভুল করে টিক দিয়েছেন? আবার চাপলে উঠে যাবে।') },
    ],
  },
  {
    id: 'receive', practice: true, minutes: 1,
    title: two('Receive a delivery', 'ডেলিভারি রিসিভ'),
    about: two('Check what came from production and confirm it.', 'প্রোডাকশন থেকে যা এল মিলিয়ে কনফার্ম।'),
    steps: [
      { id: 'row', go: 'stock/requests', find: button('On the way'), act: 'tap', title: two('A delivery on the way', 'রাস্তায় আছে এমন ডেলিভারি'), body: two('Stock › Requests lists your recent requests. When the rider brings one, tap it.', 'Stock › Requests-এ সাম্প্রতিক রিকোয়েস্ট থাকে। রাইডার মাল আনলে সেটায় চাপুন।') },
      { id: 'lines', find: text('short', sheet), title: two('Count against the list', 'লিস্ট মিলিয়ে গুনুন'), body: two('Each line shows what was sent. Short items are marked: here Veg came 20 short.', 'প্রতিটা লাইনে কত পাঠানো হয়েছে লেখা। কম এলে দাগানো থাকে: এখানে Veg ২০টা কম।') },
      { id: 'confirm', find: button('Confirm delivery', sheet), act: 'tap', title: two('Tap Confirm delivery', 'Confirm delivery চাপুন'), body: two('Once you have counted it. The store\'s stock is wrong until every delivery is confirmed.', 'গোনা হয়ে গেলে। প্রতিটা ডেলিভারি কনফার্ম না হলে দোকানের স্টক ভুল থাকে।') },
      { id: 'done', find: text('Received', sheet), title: two('Received', 'রিসিভ হয়ে গেল'), body: two('Missed one? Home shows "A delivery to check" until it is confirmed.', 'কোনোটা বাকি থাকলে Home-এ "A delivery to check" দেখাবে, কনফার্ম না করা পর্যন্ত।') },
    ],
  },
  {
    id: 'expense', practice: true, minutes: 2,
    title: two('Add an expense', 'খরচ লেখা'),
    about: two('Log a purchase, and fix one Bunny flagged.', 'কেনাকাটা লিখুন, আর বানি যেটা ধরেছে সেটা ঠিক করুন।'),
    steps: [
      { id: 'add', go: 'money/expenses', find: button('Add expense', { exact: true }), act: 'tap', title: two('Tap Add expense', 'Add expense চাপুন'), body: two('Add every expense on the day you pay it.', 'যেদিন টাকা দেবেন, সেদিনই খরচ লিখুন।') },
      { id: 'what', find: field('What was it for?', sheet), act: 'do', ready: filled('What was it for?', sheet), title: two('What was it for?', 'কী কেনা হল?'), body: two('Type it, e.g. Onion. Or tap Say it instead and speak, Bengali is fine.', 'লিখুন, যেমন Onion। অথবা Say it instead চেপে বলুন, বাংলায় চলবে।') },
      { id: 'qty', find: field('Quantity', sheet), act: 'do', ready: filled('Quantity', sheet), title: two('How much', 'কতটা'), body: two('Type the quantity, e.g. 2, and pick kg, g or piece under it.', 'পরিমাণ লিখুন, যেমন 2, আর নিচে kg, g বা piece বেছে নিন।') },
      { id: 'amount', find: field('Amount paid', sheet), act: 'do', ready: filled('Amount paid', sheet), title: two('Amount paid', 'কত টাকা দিলেন'), body: two('The total you paid, e.g. 80. Over ₹500: photograph the bill.', 'মোট কত দিলেন, যেমন 80। ₹৫০০-র বেশি হলে বিলের ছবি তুলুন।') },
      { id: 'save', find: button('Save expense', sheet), act: 'tap', title: two('Tap Save expense', 'Save expense চাপুন'), body: two('Paid from Cash comes off the store\'s cash in hand.', 'Cash থেকে দিলে দোকানের হাতের ক্যাশ থেকে কাটে।') },
      { id: 'review', find: button('Review'), act: 'tap', title: two('Bunny checks every entry', 'বানি প্রতিটা খরচ দেখে'), body: two('Something looks wrong: the same thing bought twice, or at the wrong place. Tap Review.', 'কিছু গোলমাল মনে হচ্ছে: একই জিনিস দুবার, বা ভুল জায়গায় লেখা। Review চাপুন।') },
      { id: 'why', find: text('Not usually bought here', sheet), title: two('Not usually bought here', 'এখানে সাধারণত কেনা হয় না'), body: two('Tandoori masala was logged for the store, but only the production house buys it.', 'তন্দুরি মশলা দোকানের খরচে লেখা, অথচ এটা শুধু প্রোডাকশন হাউস কেনে।') },
      { id: 'delete', find: button('Delete this entry', sheet), act: 'tap', title: two('Wrong place? Delete it', 'ভুল জায়গায়? মুছে দিন'), body: two('Delete it here, and it gets logged at the right place. If it really was for the store, tap It\'s correct.', 'এখান থেকে মুছুন, ঠিক জায়গায় লেখা হবে। সত্যিই দোকানের হলে It\'s correct চাপুন।') },
      { id: 'sure', find: button('Delete entry', sheet), act: 'tap', title: two('Tap Delete entry', 'Delete entry চাপুন'), body: two('The app asks once more before deleting.', 'মোছার আগে অ্যাপ আরেকবার জিজ্ঞেস করে।') },
      { id: 'done', title: two('Fixed', 'ঠিক হয়ে গেল'), body: two('Flags show on Home and here until each one is fixed or marked correct. Getting expenses right is part of your KPI.', 'প্রতিটা ঠিক না হওয়া পর্যন্ত Home আর এখানে দেখায়। খরচ ঠিকঠাক লেখা আপনার KPI-র অংশ।') },
    ],
  },
  {
    id: 'out-of-stock', practice: true, minutes: 1,
    title: two('Something ran out', 'কিছু শেষ হয়ে গেলে'),
    about: two('Log it, and mark it back when stock comes.', 'লিখে রাখুন, মাল এলে আবার চালু করুন।'),
    steps: [
      { id: 'list', go: 'stock/out-of-stock', find: section('Out right now'), title: two('Out right now', 'এখন যা শেষ'), body: two('First switch it off in Ciferon, so Zomato and Swiggy stop taking it. Then log it here.', 'আগে Ciferon-এ বন্ধ করুন, যাতে Zomato আর Swiggy অর্ডার না নেয়। তারপর এখানে লিখুন।') },
      { id: 'mark', find: button('Mark an item out of stock'), act: 'tap', title: two('Tap Mark an item out of stock', 'Mark an item out of stock চাপুন'), body: two('Do it the moment it runs out.', 'শেষ হওয়ামাত্র করুন।') },
      { id: 'item', find: field('Item', sheet), act: 'do', ready: () => !!input('Item', sheet)?.value, title: two('Pick the item', 'জিনিসটা বাছুন'), body: two('Choose what ran out, e.g. Paneer momos.', 'কী শেষ হল বেছে নিন, যেমন Paneer momos।') },
      { id: 'why', find: button('Sold out', sheet), act: 'tap', title: two('Why did it run out?', 'কেন শেষ হল?'), body: two('Tap Sold out. The reason shows what to fix: a short delivery, a low request, a broken machine.', 'Sold out চাপুন। কারণ থেকেই বোঝা যায় কী ঠিক করতে হবে: কম ডেলিভারি, কম রিকোয়েস্ট, খারাপ মেশিন।') },
      { id: 'save', find: button('Mark out of stock', sheet), act: 'tap', title: two('Tap Mark out of stock', 'Mark out of stock চাপুন'), body: two('The owner and operations see it straight away.', 'মালিক আর অপারেশনস সঙ্গে সঙ্গে দেখতে পান।') },
      { id: 'back', find: button('Back in stock'), title: two('Back in stock', 'আবার স্টকে'), body: two('When it arrives, tap Back in stock straight away, and switch it on in Ciferon.', 'মাল এলেই Back in stock চাপুন, আর Ciferon-এ চালু করুন।') },
    ],
  },
  {
    id: 'running-low', practice: true, minutes: 1,
    title: two('Running low', 'কিছু কমে আসছে'),
    about: two('Warn the team before something runs out.', 'শেষ হওয়ার আগে টিমকে জানান।'),
    steps: [
      { id: 'card', go: 'home', find: tour('low'), title: two('Running low on something?', 'কিছু কমে আসছে?'), body: two('Boxes, mayonnaise, gas: tell the team a day or two before it runs out.', 'বাক্স, মেয়োনিজ, গ্যাস: শেষ হওয়ার এক-দুদিন আগে টিমকে জানান।') },
      { id: 'open', find: button('Tell the team'), act: 'tap', title: two('Tap Tell the team', 'Tell the team চাপুন'), body: two('A short form opens.', 'ছোট একটা ফর্ম খুলবে।') },
      { id: 'item', find: field('Item', sheet), act: 'do', ready: filled('Item', sheet), title: two('What is running low?', 'কী কমে আসছে?'), body: two('Type it, e.g. Tissue paper.', 'লিখুন, যেমন Tissue paper।') },
      { id: 'how', find: field('How much is needed', sheet), act: 'do', title: two('How much is needed', 'কতটা লাগবে'), body: two('Optional, but it helps the shopper buy the right amount.', 'না দিলেও চলে, তবে দিলে ঠিক পরিমাণে কেনা যায়।') },
      { id: 'send', find: button('Send', { ...sheet, exact: true }), act: 'tap', title: two('Tap Send', 'Send চাপুন'), body: two('The incharge, operations and the owner get it.', 'ইনচার্জ, অপারেশনস আর মালিক পেয়ে যান।') },
      { id: 'listed', find: tour('low'), title: two('On the list', 'লিস্টে উঠে গেল'), body: two('Operations puts it on the shopping list; then it says On the shopping list. Tap Sorted when it has come.', 'অপারেশনস বাজারের লিস্টে তোলে; তখন On the shopping list লেখা দেখাবে। মাল এলে Sorted চাপুন।') },
    ],
  },
  {
    id: 'day-close', practice: true, minutes: 2,
    title: two('Close the day', 'দিনের হিসাব'),
    about: two('After closing: count the cash and Paytm, then send.', 'বন্ধের পর: ক্যাশ আর পেটিএম গুনে পাঠান।'),
    steps: [
      { id: 'sync', go: 'money/sales', find: button('Sync now'), title: two('Sync the POS', 'POS সিঙ্ক করুন'), body: two('After closing, tap Sync now to bring in the day\'s sales from the POS. (Practice: it is closed now.)', 'বন্ধের পর Sync now চেপে POS থেকে দিনের বিক্রি আনুন। (অভ্যাসে এখন বন্ধ।)') },
      { id: 'pos', find: section('Sales from the POS'), title: two('Sales from the POS', 'POS-এর বিক্রি'), body: two('Counter (cash and Paytm), Zomato and Swiggy. Your count is checked against the counter part.', 'কাউন্টার (ক্যাশ আর পেটিএম), Zomato আর Swiggy। আপনার গোনা কাউন্টারের অংশের সঙ্গে মেলানো হয়।') },
      { id: 'paytm', find: field('Paytm received'), act: 'do', ready: filled('Paytm received'), title: two('Paytm received', 'পেটিএমে কত এল'), body: two('Type 2450. In real life: the Paytm total for today.', '2450 লিখুন। আসলে: আজকের পেটিএমের মোট।') },
      { id: 'cash', find: field('Cash collected'), act: 'do', ready: filled('Cash collected'), title: two('Cash collected', 'কত ক্যাশ এল'), body: two('Type 3670: the cash taken today.', '3670 লিখুন: আজ যত ক্যাশ এসেছে।') },
      { id: 'drawer', find: field('Cash left in the drawer'), act: 'do', ready: filled('Cash left in the drawer'), title: two('Cash left in the drawer', 'ড্রয়ারে কত রইল'), body: two('Type 1920. Count the notes and coins; never guess.', '1920 লিখুন। নোট আর কয়েন গুনুন; আন্দাজে নয়।') },
      { id: 'match', find: section('Does it match?'), title: two('Does it match?', 'মিলছে কি?'), body: two('If it does not, pick what happened: missed KOT, wrong change, a tip, a counting mistake.', 'না মিললে কী হয়েছিল বেছে নিন: KOT বাদ, ভুল খুচরো, টিপ, গোনায় ভুল।') },
      { id: 'send', find: button('Send day close'), act: 'tap', title: two('Tap Send day close', 'Send day close চাপুন'), body: two('Send it every night after closing.', 'রোজ রাতে বন্ধের পর পাঠান।') },
      { id: 'anyway', find: button('Send anyway', sheet), act: 'tap', optional: true, wait: 1500, title: two('A big difference', 'অনেকটা অমিল'), body: two('A big shortage needs the owner\'s OK. Tap Send anyway.', 'বড় ঘাটতি হলে মালিকের অনুমতি লাগে। Send anyway চাপুন।') },
      { id: 'counted', find: button('I counted this myself', sheet), act: 'tap', title: two('You counted it', 'আপনি নিজে গুনেছেন'), body: two('Tick: I counted this myself and it is correct.', 'টিক দিন: আমি নিজে গুনেছি, ঠিক আছে।') },
      { id: 'final', find: button('Send day close', sheet), act: 'tap', title: two('Send it', 'পাঠিয়ে দিন'), body: two('Tap Send day close.', 'Send day close চাপুন।') },
      { id: 'done', title: two('Day closed', 'দিনের হিসাব পাঠানো হল'), body: two('The owner checks it. Then tap End shift on Home before you leave.', 'মালিক মিলিয়ে দেখবেন। তারপর বেরোনোর আগে Home-এ End shift চাপুন।') },
    ],
  },
  {
    id: 'request', practice: true, minutes: 2,
    title: two('Tomorrow\'s stock request', 'কালকের স্টক রিকোয়েস্ট'),
    about: two('Send it by midnight: let Bunny fill it, check, send.', 'রাত ১২টার মধ্যে: বানি ভরে দেবে, মিলিয়ে পাঠান।'),
    steps: [
      { id: 'due', go: 'stock/requests', find: text('Send by midnight'), title: two('Due by midnight', 'রাত ১২টার মধ্যে'), body: two('Reminders start at 9:30 PM and turn urgent at 11:15 PM. Late requests count against your KPI.', 'রাত ৯:৩০ থেকে মনে করানো শুরু, ১১:১৫-য় জরুরি। দেরি হলে KPI-তে কাটে।') },
      { id: 'fill', find: button('Fill in for me'), act: 'tap', title: two('Tap Fill in for me', 'Fill in for me চাপুন'), body: two('Bunny fills it from tomorrow\'s expected sales plus 15%, less what is left from the last delivery.', 'কালকের আন্দাজি বিক্রি আর ১৫% বেশি, শেষ ডেলিভারির বাকি মাল বাদ দিয়ে বানি ভরে দেয়।') },
      { id: 'left', find: text('Left now'), title: two('Check against the freezer', 'ফ্রিজারের সঙ্গে মেলান'), body: two('"Left now" is what the app thinks is left. Look in the freezer before you send.', '"Left now" মানে অ্যাপের হিসাবে কত বাকি। পাঠানোর আগে ফ্রিজার দেখে নিন।') },
      { id: 'more', find: button('More Chicken', { exact: true }), act: 'tap', title: two('Change a number', 'সংখ্যা বদলান'), body: two('Tap + for one more bag of Chicken, − for one less.', 'চিকেন এক ব্যাগ বেশি চাইলে +, কম চাইলে −।') },
      { id: 'sauce', find: button('Pan-Fried Sauce'), act: 'tap', title: two('Sauces', 'সস'), body: two('Tap each sauce you need, e.g. Pan-Fried Sauce.', 'যে যে সস লাগবে চাপুন, যেমন Pan-Fried Sauce।') },
      { id: 'send', find: button('Send request'), act: 'tap', title: two('Tap Send request', 'Send request চাপুন'), body: two('You see the whole request once more before it goes.', 'যাওয়ার আগে পুরো রিকোয়েস্টটা আরেকবার দেখায়।') },
      { id: 'checked', find: button('I\'ve checked', sheet), act: 'tap', title: two('Checked?', 'মিলিয়েছেন?'), body: two('Check the date and the numbers, then tick.', 'তারিখ আর সংখ্যা মিলিয়ে টিক দিন।') },
      { id: 'final', find: button('Send request', sheet), act: 'tap', title: two('Send it', 'পাঠিয়ে দিন'), body: two('Tap Send request.', 'Send request চাপুন।') },
      { id: 'sent', find: section('Tomorrow\'s request'), title: two('Sent', 'পাঠানো হল'), body: two('Production accepts it in the morning. You will see Packed and On the way here.', 'প্রোডাকশন সকালে Accept করে। এখানে Packed আর On the way দেখতে পাবেন।') },
    ],
  },
  {
    id: 'team', practice: true, minutes: 1,
    title: two('Your team', 'আপনার টিম'),
    about: two('Approve the crew\'s timesheets and leave.', 'স্টাফদের টাইমশিট আর ছুটি মঞ্জুর।'),
    steps: [
      { id: 'list', go: 'team/attendance', find: text('Timesheets'), title: two('Waiting for you', 'আপনার অপেক্ষায়'), body: two('The crew\'s timesheets and leave requests. Check them the next day.', 'স্টাফদের টাইমশিট আর ছুটির আবেদন। পরের দিন মিলিয়ে নিন।') },
      { id: 'approve', find: button('Approve Counter Crew'), act: 'tap', title: two('Approve a timesheet', 'টাইমশিট মঞ্জুর'), body: two('Check the times against what you saw, then tap the tick.', 'নিজে যা দেখেছেন তার সঙ্গে সময় মিলিয়ে টিকে চাপুন।') },
      { id: 'all', find: button('Approve all'), title: two('Approve all', 'সব মঞ্জুর'), body: two('When every one looks right. Wrong times? Tap the cross and say why.', 'সব ঠিক থাকলে। সময় ভুল হলে ক্রসে চেপে কারণ লিখুন।') },
      { id: 'leave', find: button('Family function'), act: 'tap', title: two('A leave request', 'ছুটির আবেদন'), body: two('Tap it to see the dates, the reason and their leave balance.', 'চাপলে তারিখ, কারণ আর বাকি ছুটি দেখাবে।') },
      { id: 'ok', find: button('Approve', { ...sheet, exact: true }), act: 'tap', title: two('Approve or reject', 'মঞ্জুর বা না'), body: two('Check the rota first: someone must cover. Tap Approve.', 'আগে রোস্টার দেখুন: কেউ যেন কাজ চালায়। Approve চাপুন।') },
    ],
  },
  {
    id: 'kpis', practice: true, minutes: 1,
    title: two('Your KPIs and help', 'আপনার KPI আর সাহায্য'),
    about: two('Your score, and where help is.', 'আপনার স্কোর, আর সাহায্য কোথায়।'),
    steps: [
      { id: 'open', go: 'me', find: button('My KPIs'), act: 'tap', title: two('Tap My KPIs', 'My KPIs চাপুন'), body: two('Your score this month, and the variable pay it gives.', 'এই মাসের স্কোর, আর তাতে কত ভেরিয়েবল পে।') },
      { id: 'score', find: text('out of 100'), title: two('Out of 100', '১০০-র মধ্যে'), body: two('Each KPI shows how you are doing: requests on time, expenses right, opening checklist, attendance.', 'প্রতিটা KPI-তে কেমন চলছে দেখায়: সময়ে রিকোয়েস্ট, ঠিক খরচ, খোলার চেকলিস্ট, হাজিরা।') },
      { id: 'wins', find: text('Biggest wins'), optional: true, title: two('Biggest wins', 'সবচেয়ে বড় লাভ'), body: two('What would raise your score most next time.', 'পরের বার কী করলে স্কোর সবচেয়ে বাড়বে।') },
      { id: 'contacts', go: 'me', find: button('Emergency contacts'), act: 'tap', title: two('Emergency contacts', 'জরুরি নম্বর'), body: two('Police, fire, ambulance, technicians and suppliers, one tap to call.', 'পুলিশ, দমকল, অ্যাম্বুলেন্স, মিস্ত্রি আর সাপ্লায়ার, এক চাপে ফোন।') },
      { id: 'call', find: text('Emergency (all services)'), title: two('112 first', 'প্রথমে ১১২'), body: two('112 reaches police, fire and ambulance.', '১১২-তে পুলিশ, দমকল আর অ্যাম্বুলেন্স সব পাওয়া যায়।') },
      { id: 'again', go: 'me', find: button('Learn the app'), optional: true, title: two('Practise again any time', 'যখন খুশি আবার অভ্যাস'), body: two('Me › Learn the app has every chapter.', 'Me › Learn the app-এ সব অধ্যায় আছে।') },
    ],
  },
];

// The production incharge (owner's timings from kpiCore: ship each request by 3 PM; production
// logged every day; wastage kept down). Practice data: a Fri request from Bunny Momos 1 waiting,
// the morning shopping list with 2 of 7 marked, 16 photo checks, riders Raju and Bapi.
const PRODUCTION_INCHARGE: Chapter[] = [
  findYourWay(
    [
      { path: 'production', title: two('Tap Production', 'Production চাপুন'), say: two('The stores\' requests to accept, pack and ship; today\'s batches; and the riders.', 'দোকানের রিকোয়েস্ট Accept, প্যাক আর পাঠানো; আজকের ব্যাচ; আর রাইডার।') },
      { path: 'money', title: two('Tap Money', 'Money চাপুন'), say: two('The production house\'s expenses. Add each one on the day you pay it.', 'প্রোডাকশন হাউসের খরচ। যেদিন টাকা দেবেন, সেদিনই লিখুন।') },
      { path: 'team', title: two('Tap Team', 'Team চাপুন'), say: two('The kitchen crew\'s timesheets and leave, and the workplace photos.', 'কিচেন স্টাফদের টাইমশিট আর ছুটি, আর কাজের জায়গার ছবি।') },
      { path: 'me', title: two('Tap Me', 'Me চাপুন'), say: two('Your KPIs, the photo guide, emergency numbers, and Learn the app.', 'আপনার KPI, ছবির নিয়ম, জরুরি নম্বর, আর Learn the app।') },
    ],
    [{ id: 'bunny', close: true, find: tour('ask-bunny'), optional: true, title: two('Ask Bunny', 'বানিকে জিজ্ঞেস করুন'), body: two('Stuck on a screen? Ask Bunny in plain words, Bengali is fine. It explains what you are looking at.', 'কোনো স্ক্রিনে আটকে গেলে বানিকে সহজ কথায় জিজ্ঞেস করুন, বাংলায় চলবে। যা দেখছেন তা বুঝিয়ে দেবে।') }],
  ),
  {
    id: 'shift', practice: true, minutes: 1,
    title: two('Start your shift', 'শিফট শুরু'),
    about: two('Check in when you reach the production house; it is your attendance.', 'প্রোডাকশন হাউসে পৌঁছে চেক-ইন; এটাই আপনার হাজিরা।'),
    steps: [
      { id: 'card', go: 'home', find: tour('shift'), title: two('Your shift', 'আপনার শিফট'), body: two('8 AM to 7 PM at the production house. Practice: made-up data, nothing is saved.', 'প্রোডাকশন হাউসে সকাল ৮টা থেকে সন্ধ্যা ৭টা। অভ্যাস: বানানো হিসাব, কিছু সেভ হয় না।') },
      { id: 'start', find: button('Start shift'), act: 'tap', title: two('Tap Start shift', 'Start shift চাপুন'), body: two('When you arrive. The phone checks you are at the production house, so allow location if asked.', 'পৌঁছেই চাপুন। ফোন দেখে নেয় আপনি প্রোডাকশন হাউসে আছেন কিনা, তাই লোকেশন চাইলে Allow দিন।') },
      { id: 'on', find: tour('shift'), title: two('You are on shift', 'শিফট চলছে'), body: two('The start time is your attendance. Late by more than 10 minutes counts against your KPI.', 'শুরুর সময়টাই আপনার হাজিরা। ১০ মিনিটের বেশি দেরি হলে KPI-তে কাটে।') },
      { id: 'end', find: button('End shift'), title: two('End shift when you leave', 'যাওয়ার সময় End shift'), body: two('After today\'s production is sent. Forgetting it leaves your day open.', 'আজকের প্রোডাকশন পাঠানোর পর। ভুলে গেলে দিনটা খোলা থেকে যায়।') },
    ],
  },
  {
    id: 'shopping', practice: true, minutes: 2,
    title: two('Morning shopping', 'সকালের বাজার'),
    about: two('Mark each item on operations\' list as you get it.', 'অপারেশনসের লিস্টে প্রতিটা জিনিস পেলেই দাগ দিন।'),
    steps: [
      { id: 'card', go: 'home', find: tour('shopping'), title: two('Today\'s shopping list', 'আজকের বাজারের লিস্ট'), body: two('Operations sends it the night before. The vendors already have their part on WhatsApp.', 'অপারেশনস আগের রাতে পাঠায়। ভেন্ডররা WhatsApp-এ নিজেদের অংশ আগেই পেয়ে গেছে।') },
      { id: 'open', find: button('Open the list'), act: 'tap', title: two('Tap Open the list', 'Open the list চাপুন'), body: two('Take it to the market.', 'বাজারে নিয়ে যান।') },
      { id: 'note', find: text('Chicken first', sheet), optional: true, title: two('Read the note', 'নোটটা পড়ুন'), body: two('Operations\' note comes first: here, chicken before 9.', 'অপারেশনসের নোট সবার আগে: এখানে, ৯টার আগে চিকেন।') },
      { id: 'got', find: button('Got it', { ...sheet, exact: true }), act: 'tap', title: two('Got it', 'পেয়ে গেছি'), body: two('Tap Got it as each thing goes in the bag. A different amount? Tap Change after.', 'প্রতিটা জিনিস ব্যাগে উঠলেই Got it চাপুন। পরিমাণ আলাদা হলে পরে Change চাপুন।') },
      { id: 'missing', find: button('Not found', { ...sheet, exact: true }), act: 'tap', title: two('Not found', 'পাওয়া যায়নি'), body: two('Not in the market? Tap Not found, so operations can get it elsewhere.', 'বাজারে নেই? Not found চাপুন, যাতে অপারেশনস অন্য জায়গা থেকে আনাতে পারে।') },
      { id: 'bill', find: button('Bill photo', sheet), title: two('Photograph every bill', 'প্রতিটা বিলের ছবি তুলুন'), body: two('Tap Bill photo for each bill. Operations puts the prices into the expenses from it. (Practice: no photo is sent.)', 'প্রতিটা বিলের জন্য Bill photo চাপুন। তা দেখে অপারেশনস দাম খরচে তোলে। (অভ্যাসে ছবি যায় না।)') },
      { id: 'left', find: text('left to mark', sheet), title: two('Until nothing is left', 'সব দাগ না হওয়া পর্যন্ত'), body: two('When every line is marked, the list is done and operations gets told.', 'সব লাইন দাগ হলে লিস্ট শেষ, অপারেশনস খবর পেয়ে যায়।') },
    ],
  },
  {
    id: 'requests', practice: true, minutes: 3,
    title: two('Accept, pack and ship', 'Accept, প্যাক আর পাঠানো'),
    about: two('A store\'s request, from Accept to on the way, by 3 PM.', 'দোকানের রিকোয়েস্ট, Accept থেকে রওনা পর্যন্ত, দুপুর ৩টের মধ্যে।'),
    steps: [
      { id: 'tabs', go: 'production/requests', find: button('To pack'), title: two('The stores\' requests', 'দোকানের রিকোয়েস্ট'), body: two('To pack, Packed and Sent. Each store sends tomorrow\'s request by midnight.', 'To pack, Packed আর Sent। প্রতিটা দোকান রাত ১২টার মধ্যে কালকের রিকোয়েস্ট পাঠায়।') },
      { id: 'open', find: button('· sent'), act: 'tap', title: two('Open a request', 'রিকোয়েস্ট খুলুন'), body: two('Bunny Momos 1\'s request for tomorrow. Tap it.', 'Bunny Momos 1-এর কালকের রিকোয়েস্ট। চাপুন।') },
      { id: 'notes', find: text('Saturday rush', sheet), optional: true, title: two('Read the notes', 'নোট পড়ুন'), body: two('The store\'s note, here a Saturday rush. Every momo, sauce and supply is listed above it.', 'দোকানের নোট, এখানে শনিবারের ভিড়। ওপরে সব মোমো, সস আর জিনিস লেখা।') },
      { id: 'accept', find: button('Accept', { ...sheet, exact: true }), act: 'tap', title: two('Tap Accept', 'Accept চাপুন'), body: two('Accept in the morning, so the store knows it is coming.', 'সকালেই Accept করুন, যাতে দোকান জানে মাল আসছে।') },
      { id: 'pack', find: button('Start packing', sheet), act: 'tap', title: two('Tap Start packing', 'Start packing চাপুন'), body: two('When you start filling the bags.', 'ব্যাগ ভরা শুরু করলে।') },
      { id: 'packed', find: button('Mark packed', sheet), act: 'tap', title: two('Tap Mark packed', 'Mark packed চাপুন'), body: two('Every bag packed and labelled.', 'সব ব্যাগ প্যাক করে লেবেল লাগানো হয়ে গেলে।') },
      { id: 'ship', find: button('Ship', { ...sheet, exact: true }), act: 'tap', title: two('Tap Ship', 'Ship চাপুন'), body: two('You check what is really going, bag by bag.', 'ব্যাগ ধরে ধরে কী যাচ্ছে মিলিয়ে নিন।') },
      { id: 'less', find: button('Less Veg', sheet), act: 'tap', title: two('Short of something?', 'কিছু কম?'), body: two('Say only 4 bags of Veg are ready: tap − once.', 'ধরুন Veg মাত্র ৪ ব্যাগ তৈরি: একবার − চাপুন।') },
      { id: 'why', find: field('Why is it different?', sheet), act: 'do', ready: filled('Why is it different?', sheet), title: two('Write why', 'কারণ লিখুন'), body: two('Anything different needs a reason, e.g. Not enough in stock. The store sees it.', 'আলাদা হলে কারণ লাগে, যেমন Not enough in stock। দোকান দেখতে পায়।') },
      { id: 'checked', find: button('I am sending these', sheet), act: 'tap', title: two('You checked it', 'মিলিয়ে নিয়েছেন'), body: two('Tick: I am sending these and have checked the quantities.', 'টিক দিন: যা পাঠাচ্ছি মিলিয়ে নিয়েছি।') },
      { id: 'send', find: button('Ship', { ...sheet, exact: true }), act: 'tap', title: two('Ship it', 'পাঠিয়ে দিন'), body: two('Tap Ship.', 'Ship চাপুন।') },
      { id: 'way', find: text('20 short', sheet), title: two('On the way', 'রওনা হয়ে গেল'), body: two('The store sees Veg 20 short with your reason. Shipped by 3 PM counts as on time for your KPI.', 'দোকান দেখবে Veg ২০টা কম, আপনার কারণসহ। দুপুর ৩টের মধ্যে পাঠালে KPI-তে সময়মতো ধরা হয়।') },
    ],
  },
  {
    id: 'rider', practice: true, minutes: 1,
    title: two('Call a rider', 'রাইডার ডাকুন'),
    about: two('Send the packed stock to the store with a rider.', 'প্যাক করা মাল রাইডার দিয়ে দোকানে পাঠান।'),
    steps: [
      { id: 'call', go: 'production/riders', find: button('Call a rider'), act: 'tap', title: two('Tap Call a rider', 'Call a rider চাপুন'), body: two('Production › Riders. Call one as soon as the bags are packed.', 'Production › Riders। ব্যাগ প্যাক হলেই ডাকুন।') },
      { id: 'who', find: button('Raju', sheet), act: 'tap', title: two('Pick the rider', 'রাইডার বাছুন'), body: two('Pick one who is Available, e.g. Raju.', 'যে Available আছে তাকে বাছুন, যেমন Raju।') },
      { id: 'where', find: button('Bunny Momos 1', sheet), act: 'tap', title: two('Where to', 'কোথায়'), body: two('Tap the store it is going to.', 'যে দোকানে যাচ্ছে সেটায় চাপুন।') },
      { id: 'fare', find: field('Fare for this ride', sheet), title: two('The fare', 'ভাড়া'), body: two('The rider\'s usual fare. Change it only for an unusual ride.', 'রাইডারের সাধারণ ভাড়া। অন্যরকম রাইড হলে তবেই বদলান।') },
      { id: 'now', find: button('Call rider now', sheet), act: 'tap', title: two('Tap Call rider now', 'Call rider now চাপুন'), body: two('The rider\'s phone rings.', 'রাইডারের ফোন বেজে ওঠে।') },
      { id: 'track', find: section('In progress'), title: two('Follow the ride', 'রাইড দেখুন'), body: two('Called, on the way, delivered: each step shows here. Fares are paid from Team › Pay.', 'ডাকা হল, রাস্তায়, পৌঁছে গেল: প্রতিটা ধাপ এখানে দেখায়। ভাড়া Team › Pay থেকে দেওয়া হয়।') },
    ],
  },
  {
    id: 'batches', practice: true, minutes: 2,
    title: two('Log today\'s production', 'আজকের প্রোডাকশন লেখা'),
    about: two('Each batch as it is made, then send the day.', 'প্রতিটা ব্যাচ বানানোর সঙ্গে সঙ্গে, তারপর দিনটা পাঠান।'),
    steps: [
      { id: 'plan', go: 'production/batches', find: text('planned pieces'), title: two('Today\'s plan', 'আজকের প্ল্যান'), body: two('Tomorrow\'s expected sales plus 15%, in bags, for each momo.', 'প্রতিটা মোমোর জন্য কালকের আন্দাজি বিক্রি আর ১৫% বেশি, ব্যাগে।') },
      { id: 'open', find: button('Stuffing and coating'), act: 'tap', title: two('Log a batch', 'ব্যাচ লিখুন'), body: two('Tap Stuffing and coating each time a batch is made.', 'প্রতিবার ব্যাচ বানালে Stuffing and coating চাপুন।') },
      { id: 'kg', find: field('Stuffing (kg)'), act: 'do', ready: filled('Stuffing (kg)'), title: two('How much stuffing', 'কত স্টাফিং'), body: two('Pick the momo type above, then type the kg, e.g. 5.', 'ওপরে মোমোর ধরন বেছে kg লিখুন, যেমন 5।') },
      { id: 'add', find: button('Add to today\'s batches'), act: 'tap', title: two('Tap Add to today\'s batches', 'Add to today\'s batches চাপুন'), body: two('It joins today\'s list with the time.', 'সময়সহ আজকের লিস্টে উঠে যায়।') },
      { id: 'made', find: field('Chicken · Pieces made'), act: 'do', ready: filled('Chicken · Pieces made'), title: two('Pieces made', 'কত পিস হল'), body: two('Type the pieces made, e.g. 250 Chicken. Keep it up to date through the day.', 'কত পিস হল লিখুন, যেমন চিকেন 250। সারাদিন আপডেট রাখুন।') },
      { id: 'left', find: button('Leftover count'), title: two('At the end of the day', 'দিনের শেষে'), body: two('Count what is left. It becomes tomorrow\'s opening stock. Wastage goes under Other wastage.', 'কী বাকি গুনে লিখুন। সেটাই কালকের শুরুর স্টক। নষ্ট হলে Other wastage-এ লিখুন।') },
      { id: 'send', find: button('Send today\'s production'), act: 'tap', title: two('Tap Send today\'s production', 'Send today\'s production চাপুন'), body: two('Once a day, when production is done.', 'দিনে একবার, প্রোডাকশন শেষ হলে।') },
      { id: 'final', find: button('Send today\'s production', sheet), act: 'tap', title: two('Check and send', 'মিলিয়ে পাঠান'), body: two('Pieces made against the plan. Tap Send today\'s production.', 'প্ল্যানের সঙ্গে কত পিস হল মিলিয়ে Send today\'s production চাপুন।') },
      { id: 'done', title: two('Sent for approval', 'মঞ্জুরির জন্য পাঠানো হল'), body: two('Operations approves it. Logging production every day is 15 points of your KPI.', 'অপারেশনস মঞ্জুর করে। রোজ প্রোডাকশন লেখা আপনার KPI-র ১৫ পয়েন্ট।') },
    ],
  },
  {
    id: 'photos', practice: true, minutes: 1,
    title: two('Workplace photos', 'কাজের জায়গার ছবি'),
    about: two('The morning photo checks: which photos, by when.', 'সকালের ছবি চেক: কোন ছবি, কখনের মধ্যে।'),
    steps: [
      { id: 'mine', go: 'team/checks', find: button('My checks', { exact: true }), act: 'tap', title: two('Tap My checks', 'My checks চাপুন'), body: two('Team › Checks › My checks: today\'s photos for the production house.', 'Team › Checks › My checks: প্রোডাকশন হাউসের আজকের ছবি।') },
      { id: 'count', find: text('of 16 done'), title: two('16 checks', '১৬টা চেক'), body: two('Freezers, kneader, sheet machine, steamer and the rest, each with its time.', 'ফ্রিজার, ময়দা মাখার মেশিন, শিট মেশিন, স্টিমার ইত্যাদি, প্রতিটার সময়সহ।') },
      { id: 'shots', find: text('Inside the bowl'), title: two('Which photos', 'কোন ছবি'), body: two('Each check names its photos, e.g. Inside the bowl and Full machine. Tap a name to take that photo.', 'প্রতিটা চেকে ছবির নাম লেখা, যেমন Inside the bowl আর Full machine। নামে চাপলে সেই ছবি তোলা যায়।') },
      { id: 'late', find: text('Late: send it now'), optional: true, title: two('Late?', 'দেরি?'), body: two('Send it anyway: late is better than missing. Bunny scores each photo out of 10.', 'তবুও পাঠান: না পাঠানোর চেয়ে দেরি ভালো। বানি প্রতিটা ছবিকে ১০-এর মধ্যে নম্বর দেয়।') },
      { id: 'guide', go: 'photo-guide', find: text('Lid seal clean'), optional: true, title: two('The photo guide', 'ছবির নিয়ম'), body: two('Me › Photo guide: each check\'s time, its photos, and what they must show, with a good sample once the owner adds one.', 'Me › Photo guide: প্রতিটা চেকের সময়, কোন ছবি, কী দেখা যাবে, আর মালিক দিলে একটা ভালো নমুনা।') },
    ],
  },
  {
    id: 'expense', practice: true, minutes: 1,
    title: two('Add an expense', 'খরচ লেখা'),
    about: two('Log a production house purchase.', 'প্রোডাকশন হাউসের কেনাকাটা লিখুন।'),
    steps: [
      { id: 'add', go: 'money/expenses', find: button('Add expense', { exact: true }), act: 'tap', title: two('Tap Add expense', 'Add expense চাপুন'), body: two('Add every expense on the day you pay it.', 'যেদিন টাকা দেবেন, সেদিনই খরচ লিখুন।') },
      { id: 'what', find: field('What was it for?', sheet), act: 'do', ready: filled('What was it for?', sheet), title: two('What was it for?', 'কী কেনা হল?'), body: two('Type it, e.g. Cabbage. Or tap Say it instead and speak, Bengali is fine.', 'লিখুন, যেমন Cabbage। অথবা Say it instead চেপে বলুন, বাংলায় চলবে।') },
      { id: 'amount', find: field('Amount paid', sheet), act: 'do', ready: filled('Amount paid', sheet), title: two('Amount paid', 'কত টাকা দিলেন'), body: two('The total you paid. Over ₹500: photograph the bill.', 'মোট কত দিলেন। ₹৫০০-র বেশি হলে বিলের ছবি তুলুন।') },
      { id: 'save', find: button('Save expense', sheet), act: 'tap', title: two('Tap Save expense', 'Save expense চাপুন'), body: two('It goes under Production. Bunny checks it: the same thing bought twice, or at the wrong place, is flagged.', 'এটা Production-এ যায়। বানি মিলিয়ে দেখে: একই জিনিস দুবার, বা ভুল জায়গায় লেখা হলে ধরে ফেলে।') },
    ],
  },
  {
    id: 'running-low', practice: true, minutes: 1,
    title: two('Running low', 'কিছু কমে আসছে'),
    about: two('Warn the team before something runs out.', 'শেষ হওয়ার আগে টিমকে জানান।'),
    steps: [
      { id: 'card', go: 'home', find: tour('low'), title: two('Running low on something?', 'কিছু কমে আসছে?'), body: two('Maida, gas, oil: tell the team a day or two before it runs out.', 'ময়দা, গ্যাস, তেল: শেষ হওয়ার এক-দুদিন আগে টিমকে জানান।') },
      { id: 'open', find: button('Tell the team'), act: 'tap', title: two('Tap Tell the team', 'Tell the team চাপুন'), body: two('A short form opens.', 'ছোট একটা ফর্ম খুলবে।') },
      { id: 'item', find: field('Item', sheet), act: 'do', ready: filled('Item', sheet), title: two('What is running low?', 'কী কমে আসছে?'), body: two('Type it, e.g. Maida (flour).', 'লিখুন, যেমন Maida (flour)।') },
      { id: 'send', find: button('Send', { ...sheet, exact: true }), act: 'tap', title: two('Tap Send', 'Send চাপুন'), body: two('Operations puts it on the shopping list; you will see it on tomorrow\'s list.', 'অপারেশনস বাজারের লিস্টে তোলে; কালকের লিস্টে দেখতে পাবেন।') },
    ],
  },
  {
    id: 'team', practice: true, minutes: 1,
    title: two('Your team', 'আপনার টিম'),
    about: two('Approve the kitchen crew\'s timesheets.', 'কিচেন স্টাফদের টাইমশিট মঞ্জুর।'),
    steps: [
      { id: 'list', go: 'team/attendance', find: text('Timesheets'), title: two('Waiting for you', 'আপনার অপেক্ষায়'), body: two('The crew\'s timesheets and leave requests. Check them the next day.', 'স্টাফদের টাইমশিট আর ছুটির আবেদন। পরের দিন মিলিয়ে নিন।') },
      { id: 'approve', find: button('Approve Kitchen Crew'), act: 'tap', title: two('Approve a timesheet', 'টাইমশিট মঞ্জুর'), body: two('Check the times against what you saw, then tap the tick.', 'নিজে যা দেখেছেন তার সঙ্গে সময় মিলিয়ে টিকে চাপুন।') },
      { id: 'all', find: button('Approve all'), title: two('Approve all', 'সব মঞ্জুর'), body: two('When every one looks right. Wrong times? Tap the cross and say why.', 'সব ঠিক থাকলে। সময় ভুল হলে ক্রসে চেপে কারণ লিখুন।') },
    ],
  },
  {
    id: 'kpis', practice: true, minutes: 1,
    title: two('Your KPIs and help', 'আপনার KPI আর সাহায্য'),
    about: two('Your score, and where help is.', 'আপনার স্কোর, আর সাহায্য কোথায়।'),
    steps: [
      { id: 'open', go: 'me', find: button('My KPIs'), act: 'tap', title: two('Tap My KPIs', 'My KPIs চাপুন'), body: two('Your score this month, and the variable pay it gives.', 'এই মাসের স্কোর, আর তাতে কত ভেরিয়েবল পে।') },
      { id: 'score', find: text('out of 100'), title: two('Out of 100', '১০০-র মধ্যে'), body: two('Each KPI shows how you are doing: production logged, wastage, shipped by 3 PM, attendance.', 'প্রতিটা KPI-তে কেমন চলছে দেখায়: প্রোডাকশন লেখা, নষ্ট, ৩টের মধ্যে পাঠানো, হাজিরা।') },
      { id: 'wins', find: text('Biggest wins'), optional: true, title: two('Biggest wins', 'সবচেয়ে বড় লাভ'), body: two('What would raise your score most next time.', 'পরের বার কী করলে স্কোর সবচেয়ে বাড়বে।') },
      { id: 'contacts', go: 'me', find: button('Emergency contacts'), act: 'tap', title: two('Emergency contacts', 'জরুরি নম্বর'), body: two('Police, fire, ambulance, technicians and suppliers, one tap to call.', 'পুলিশ, দমকল, অ্যাম্বুলেন্স, মিস্ত্রি আর সাপ্লায়ার, এক চাপে ফোন।') },
      { id: 'again', go: 'me', find: button('Learn the app'), optional: true, title: two('Practise again any time', 'যখন খুশি আবার অভ্যাস'), body: two('Me › Learn the app has every chapter.', 'Me › Learn the app-এ সব অধ্যায় আছে।') },
    ],
  },
];

// Operations (Aniket): the production house by day, a store on cover days, and the buying. Practice
// data: a store cover today (5 to 10 PM, leave at 4:30), tomorrow's list not written, yesterday's
// list bought and waiting for prices, Wed's production waiting for approval, the tandoori masala
// logged at the store by operations.
const OPERATIONS: Chapter[] = [
  findYourWay(
    [
      { path: 'stock', title: two('Tap Stock', 'Stock চাপুন'), say: two('The stores\' requests, production and its approvals, and stock on hand.', 'দোকানের রিকোয়েস্ট, প্রোডাকশন আর তার মঞ্জুরি, আর হাতে কত স্টক।') },
      { path: 'money', title: two('Tap Money', 'Money চাপুন'), say: two('Sales, expenses, cash and Paytm for every place.', 'সব জায়গার বিক্রি, খরচ, ক্যাশ আর পেটিএম।') },
      { path: 'team', title: two('Tap Team', 'Team চাপুন'), say: two('People, attendance and leave, KPIs and the photo checks.', 'লোকজন, হাজিরা আর ছুটি, KPI আর ছবি চেক।') },
      { path: 'more', title: two('Tap More', 'More চাপুন'), say: two('Shopping lists, the opening checklist, photo checks, reports, emergency numbers and Learn the app.', 'বাজারের লিস্ট, দোকান খোলার চেকলিস্ট, ছবি চেক, রিপোর্ট, জরুরি নম্বর আর Learn the app।') },
    ],
    [{ id: 'bunny', close: true, find: tour('ask-bunny'), optional: true, title: two('Ask Bunny', 'বানিকে জিজ্ঞেস করুন'), body: two('Ask anything about sales, stock or money in plain words, Bengali is fine.', 'বিক্রি, স্টক বা টাকা নিয়ে সহজ কথায় যা খুশি জিজ্ঞেস করুন, বাংলায় চলবে।') }],
  ),
  {
    id: 'shift', practice: true, minutes: 1,
    title: two('Shift and store cover', 'শিফট আর দোকান কভার'),
    about: two('Check in at the production house; on cover days, at the store too.', 'প্রোডাকশন হাউসে চেক-ইন; কভারের দিনে দোকানেও।'),
    steps: [
      { id: 'card', go: 'home', find: tour('shift'), title: two('Your shift', 'আপনার শিফট'), body: two('8 AM to 7 PM at the production house. Practice: made-up data, nothing is saved.', 'প্রোডাকশন হাউসে সকাল ৮টা থেকে সন্ধ্যা ৭টা। অভ্যাস: বানানো হিসাব, কিছু সেভ হয় না।') },
      { id: 'start', find: button('Start shift'), act: 'tap', title: two('Tap Start shift', 'Start shift চাপুন'), body: two('When you reach the production house. Allow location if asked.', 'প্রোডাকশন হাউসে পৌঁছেই চাপুন। লোকেশন চাইলে Allow দিন।') },
      { id: 'cover', find: text('Store cover today'), title: two('A store-cover day', 'দোকান কভারের দিন'), body: two('When someone at the store is on leave, you cover the evening: leave the production house at 4:30 PM, at the store 5 to 10 PM.', 'দোকানে কেউ ছুটিতে থাকলে সন্ধ্যাটা আপনি সামলান: বিকেল ৪:৩০-এ প্রোডাকশন হাউস থেকে বেরিয়ে, দোকানে ৫টা থেকে ১০টা।') },
      { id: 'later', find: button('Store check-in opens'), title: two('The store check-in', 'দোকানে চেক-ইন'), body: two('It opens at 4:30 PM. Check in when you reach the store and out when you leave; it counts as your attendance there.', 'বিকেল ৪:৩০-এ খোলে। দোকানে পৌঁছে চেক-ইন, যাওয়ার সময় চেক-আউট; ওখানকার হাজিরা হিসেবে ধরা হয়।') },
    ],
  },
  {
    id: 'shopping', practice: true, minutes: 3,
    title: two('Tomorrow\'s shopping list', 'কালকের বাজারের লিস্ট'),
    about: two('Write it from the running-low warnings, send it, order from the vendors.', 'কম পড়ার খবর থেকে লিস্ট বানান, পাঠান, ভেন্ডরদের অর্ডার দিন।'),
    steps: [
      { id: 'low', go: 'home', find: tour('low'), title: two('Running low', 'কম পড়ছে'), body: two('Everyone\'s warnings from the stores and the production house. They go on tomorrow\'s list.', 'দোকান আর প্রোডাকশন হাউস থেকে সবার খবর। এগুলো কালকের লিস্টে ওঠে।') },
      { id: 'new', find: button('New list'), act: 'tap', title: two('Tap New list', 'New list চাপুন'), body: two('In the evening, for tomorrow.', 'সন্ধ্যায়, কালকের জন্য।') },
      { id: 'flagged', find: button('Maida (flour)', sheet), act: 'tap', title: two('Add what is running low', 'যা কম পড়ছে যোগ করুন'), body: two('Flagged items are at the top. Tap Maida to put it on the list.', 'কম পড়ার জিনিস সবার ওপরে। Maida চেপে লিস্টে তুলুন।') },
      { id: 'usual', find: button('Chicken', sheet), act: 'tap', title: two('Add a usual buy', 'রোজকার কেনা যোগ করুন'), body: two('Your usual buys come next. Tap Chicken. The names match the expenses, so the prices go straight in later.', 'তারপর রোজকার কেনাকাটা। Chicken চাপুন। নাম খরচের সঙ্গে মেলে, তাই পরে দাম সোজা বসে যায়।') },
      { id: 'qty', find: field('How much Chicken', sheet), act: 'do', ready: filled('How much Chicken', sheet), title: two('How much', 'কতটা'), body: two('Type the amount, e.g. 12 kg. Under it: which place it is for and the vendor.', 'পরিমাণ লিখুন, যেমন 12 kg। নিচে: কোন জায়গার জন্য আর কোন ভেন্ডর।') },
      { id: 'check', find: button('Check', { ...sheet, exact: true }), act: 'tap', title: two('Tap Check', 'Check চাপুন'), body: two('Bunny checks each amount against the usual: 25 kg of coriander would be caught here.', 'বানি প্রতিটা পরিমাণ সাধারণের সঙ্গে মেলায়: 25 kg ধনেপাতা হলে এখানেই ধরা পড়ত।') },
      { id: 'send', find: button('Send to Production', sheet), act: 'tap', title: two('Send it', 'পাঠিয়ে দিন'), body: two('The production incharge does the shopping and gets it in the morning.', 'প্রোডাকশন ইনচার্জ বাজার করেন, সকালে লিস্ট পেয়ে যান।') },
      { id: 'vendors', find: button('WhatsApp', sheet), title: two('Order from the vendors', 'ভেন্ডরদের অর্ডার'), body: two('Each vendor\'s part is ready: tap WhatsApp, check it and press send there. (Practice: the numbers are made up.)', 'প্রতিটা ভেন্ডরের অংশ তৈরি: WhatsApp চাপুন, দেখে নিয়ে সেখানে send চাপুন। (অভ্যাসে নম্বরগুলো বানানো।)') },
      { id: 'done', find: button('Done', { ...sheet, exact: true }), act: 'tap', title: two('Tap Done', 'Done চাপুন'), body: two('The list shows on Home until it is bought and priced.', 'কেনা আর দাম বসানো না হওয়া পর্যন্ত লিস্ট Home-এ থাকে।') },
    ],
  },
  {
    id: 'prices', practice: true, minutes: 2,
    title: two('Price the shopping', 'বাজারের দাম বসানো'),
    about: two('Yesterday\'s shopping into the expenses, from the bills.', 'গতকালের বাজার বিল দেখে খরচে তোলা।'),
    steps: [
      { id: 'open', go: 'home', find: button('to price'), act: 'tap', title: two('A list to price', 'দাম বসানোর লিস্ট'), body: two('Bought and waiting for its prices. Tap it.', 'কেনা হয়ে গেছে, দামের অপেক্ষায়। চাপুন।') },
      { id: 'chicken', find: field('Price for Chicken (boneless)', sheet), act: 'do', ready: filled('Price for Chicken (boneless)', sheet), title: two('What it cost', 'কত দাম'), body: two('Type the price from the bill photo, e.g. 2640. Fix the quantity first if it differs.', 'বিলের ছবি দেখে দাম লিখুন, যেমন 2640। পরিমাণ আলাদা হলে আগে ঠিক করুন।') },
      { id: 'cabbage', find: field('Price for Cabbage', sheet), act: 'do', ready: filled('Price for Cabbage', sheet), title: two('The next one', 'পরেরটা'), body: two('Cabbage, e.g. 240. The last price shows under it, so a slip stands out.', 'বাঁধাকপি, যেমন 240। নিচে আগের দাম দেখায়, তাই ভুল চোখে পড়ে।') },
      { id: 'leave', find: button('Leave out', sheet), title: two('Leave out', 'বাদ দিন'), body: two('A line that was not bought: Leave out.', 'যা কেনা হয়নি: Leave out।') },
      { id: 'save', find: button('Save to expenses', sheet), title: two('Save to expenses', 'খরচে তুলুন'), body: two('Once every line has its price, Save to expenses: each goes into its own place\'s expenses, with the bill.', 'সব লাইনে দাম বসলে Save to expenses: প্রতিটা নিজের জায়গার খরচে যায়, বিলসহ।') },
      { id: 'done', close: true, title: two('Same morning', 'সেদিন সকালেই'), body: two('Price it the morning it is bought, so the day\'s expenses and profit are right.', 'যেদিন কেনা, সেদিন সকালেই দাম বসান, যাতে দিনের খরচ আর লাভ ঠিক থাকে।') },
    ],
  },
  {
    id: 'production', practice: true, minutes: 1,
    title: two('Approve production', 'প্রোডাকশন মঞ্জুর'),
    about: two('Check and approve each day the production house sends.', 'প্রোডাকশন হাউস যে দিন পাঠায়, মিলিয়ে মঞ্জুর করুন।'),
    steps: [
      { id: 'tab', go: 'stock/production', find: button('Approvals'), act: 'tap', title: two('Tap Approvals', 'Approvals চাপুন'), body: two('Stock › Production › Approvals. Home also says when one is waiting.', 'Stock › Production › Approvals। কিছু অপেক্ষায় থাকলে Home-এও বলে।') },
      { id: 'day', find: button('kg wasted'), act: 'tap', title: two('A day waiting', 'অপেক্ষায় থাকা দিন'), body: two('Pieces made and wastage for the day. Tap it.', 'দিনের কত পিস হল আর কত নষ্ট। চাপুন।') },
      { id: 'look', find: text('Wastage', sheet), title: two('Check the numbers', 'সংখ্যা মিলিয়ে নিন'), body: two('Against what you saw. Something wrong? Ask the production incharge before approving.', 'নিজে যা দেখেছেন তার সঙ্গে। কিছু ভুল লাগলে মঞ্জুরের আগে প্রোডাকশন ইনচার্জকে জিজ্ঞেস করুন।') },
      { id: 'approve', find: button('Approve', { ...sheet, exact: true }), act: 'tap', title: two('Tap Approve', 'Approve চাপুন'), body: two('The day is final.', 'দিনটা চূড়ান্ত হয়ে গেল।') },
    ],
  },
  {
    id: 'stock', practice: true, minutes: 1,
    title: two('The stores\' requests', 'দোকানের রিকোয়েস্ট'),
    about: two('Where every request stands, and the opening checklists.', 'প্রতিটা রিকোয়েস্ট কোথায়, আর দোকান খোলার চেকলিস্ট।'),
    steps: [
      { id: 'queue', go: 'stock/requests', find: button('To pack'), title: two('The production queue', 'প্রোডাকশনের কাজ'), body: two('Requests to pack, packed and sent, from every store.', 'সব দোকানের রিকোয়েস্ট: প্যাক বাকি, প্যাক হয়েছে, পাঠানো হয়েছে।') },
      { id: 'stand', find: section('Where requests stand'), title: two('Where requests stand', 'রিকোয়েস্ট কোথায়'), body: two('Waiting to be accepted, in progress, completed. A store with nothing sent by midnight gets an urgent reminder.', 'Accept-এর অপেক্ষায়, চলছে, শেষ। রাত ১২টার মধ্যে কিছু না পাঠালে দোকান জরুরি রিমাইন্ডার পায়।') },
      { id: 'opening', go: 'opening', find: text('of 12 ready'), title: two('Opening checklists', 'দোকান খোলার চেকলিস্ট'), body: two('More › Store opening checklist: each store\'s list by 4 PM. Home tells you when one is late.', 'More › Store opening checklist: বিকেল ৪টের মধ্যে প্রতিটা দোকানের লিস্ট। দেরি হলে Home জানায়।') },
    ],
  },
  {
    id: 'expense', practice: true, minutes: 1,
    title: two('Fix a flagged expense', 'ধরা পড়া খরচ ঠিক করা'),
    about: two('An entry logged at the wrong place.', 'ভুল জায়গায় লেখা খরচ।'),
    steps: [
      { id: 'open', go: 'home', find: button('expense entry to check'), act: 'tap', title: two('An entry to check', 'দেখার মতো খরচ'), body: two('Bunny checks every expense. Tap it.', 'বানি প্রতিটা খরচ মিলিয়ে দেখে। চাপুন।') },
      { id: 'why', find: text('Not usually bought here', sheet), title: two('Not usually bought here', 'এখানে সাধারণত কেনা হয় না'), body: two('Tandoori masala logged for the store, but only the production house buys it.', 'তন্দুরি মশলা দোকানের খরচে লেখা, অথচ শুধু প্রোডাকশন হাউস কেনে।') },
      { id: 'delete', find: button('Delete this entry', sheet), act: 'tap', title: two('Wrong place? Delete it', 'ভুল জায়গায়? মুছে দিন'), body: two('Then log it under Production. If it really was for the store, tap It\'s correct instead.', 'তারপর Production-এ লিখুন। সত্যিই দোকানের হলে বরং It\'s correct চাপুন।') },
      { id: 'sure', find: button('Delete entry', sheet), act: 'tap', title: two('Tap Delete entry', 'Delete entry চাপুন'), body: two('The app asks once more before deleting.', 'মোছার আগে অ্যাপ আরেকবার জিজ্ঞেস করে।') },
    ],
  },
  {
    id: 'team', practice: true, minutes: 1,
    title: two('Your team', 'আপনার টিম'),
    about: two('Timesheets and leave waiting for you.', 'আপনার অপেক্ষায় টাইমশিট আর ছুটি।'),
    steps: [
      { id: 'list', go: 'team/attendance', find: text('Timesheets'), title: two('Waiting for you', 'আপনার অপেক্ষায়'), body: two('Timesheets and leave requests. Check them the next day.', 'টাইমশিট আর ছুটির আবেদন। পরের দিন মিলিয়ে নিন।') },
      { id: 'approve', find: button('Approve Counter Crew'), act: 'tap', title: two('Approve a timesheet', 'টাইমশিট মঞ্জুর'), body: two('Check the times, then tap the tick.', 'সময় মিলিয়ে টিকে চাপুন।') },
      { id: 'leave', find: button('Family function'), act: 'tap', title: two('A leave request', 'ছুটির আবেদন'), body: two('Tap it: the dates, the reason and the leave balance.', 'চাপুন: তারিখ, কারণ আর বাকি ছুটি।') },
      { id: 'ok', find: button('Approve', { ...sheet, exact: true }), act: 'tap', title: two('Approve or reject', 'মঞ্জুর বা না'), body: two('Check who covers first: on a store-cover day it may be you.', 'আগে দেখুন কে সামলাবে: দোকান কভারের দিনে হয়তো আপনিই।') },
    ],
  },
  {
    id: 'kpis', practice: true, minutes: 1,
    title: two('Your KPIs and help', 'আপনার KPI আর সাহায্য'),
    about: two('Your score, and where help is.', 'আপনার স্কোর, আর সাহায্য কোথায়।'),
    steps: [
      { id: 'open', go: 'more', find: button('My KPIs'), act: 'tap', title: two('Tap My KPIs', 'My KPIs চাপুন'), body: two('More › My KPIs: your score this month, and the variable pay it gives.', 'More › My KPIs: এই মাসের স্কোর, আর তাতে কত ভেরিয়েবল পে।') },
      { id: 'score', find: text('out of 100'), title: two('Out of 100', '১০০-র মধ্যে'), body: two('Each KPI shows how you are doing, with what to do next under Biggest wins.', 'প্রতিটা KPI-তে কেমন চলছে, আর Biggest wins-এ এরপর কী করবেন।') },
      { id: 'contacts', go: 'more', find: button('Emergency contacts'), act: 'tap', title: two('Emergency contacts', 'জরুরি নম্বর'), body: two('Police, fire, ambulance, technicians and suppliers, one tap to call. You can add numbers here.', 'পুলিশ, দমকল, অ্যাম্বুলেন্স, মিস্ত্রি আর সাপ্লায়ার, এক চাপে ফোন। নম্বর এখানে যোগ করা যায়।') },
      { id: 'again', go: 'more', find: button('Learn the app'), optional: true, title: two('Practise again any time', 'যখন খুশি আবার অভ্যাস'), body: two('More › Learn the app has every chapter.', 'More › Learn the app-এ সব অধ্যায় আছে।') },
    ],
  },
];

// Store crew (Saniya, Nabendu): Bengali screens, so every label is found in both languages (k).
// Practice data: on shift since 2:52 PM, 4 store photo checks, two items out of stock.
const STORE_CREW: Chapter[] = [
  findYourWay([
    { path: 'stock', title: two('Tap Stock', 'Stock চাপুন'), say: two('Log anything that runs out, and mark it back when stock arrives.', 'কিছু শেষ হলে লিখুন, মাল এলে আবার চালু করুন।') },
    { path: 'pay', title: two('Tap Pay', 'বেতন চাপুন'), say: two('What you have earned this month, your payslips and any advance.', 'এই মাসে কত হল, পে-স্লিপ আর অ্যাডভান্স।') },
    { path: 'me', title: two('Tap Me', 'আমি চাপুন'), say: two('Attendance and leave, KPIs, workplace photos, the photo guide, emergency numbers and Learn the app.', 'হাজিরা আর ছুটি, KPI, কাজের জায়গার ছবি, ছবির নিয়ম, জরুরি নম্বর আর অ্যাপ শিখুন।') },
  ]),
  {
    id: 'shift', practice: true, minutes: 1,
    title: two('Your shift and today\'s jobs', 'শিফট আর আজকের কাজ'),
    about: two('Your attendance, and what to do today.', 'আপনার হাজিরা, আর আজ কী করতে হবে।'),
    steps: [
      { id: 'card', go: 'home', find: tour('shift'), title: two('Your shift', 'আপনার শিফট'), body: two('Tap Start shift when you reach the store; the time is your attendance. Here you started at 2:52 PM. Practice: nothing is saved.', 'দোকানে পৌঁছে Start shift চাপুন; সেই সময়টাই হাজিরা। এখানে ২:৫২-য় শুরু হয়েছে। অভ্যাস: কিছু সেভ হয় না।') },
      { id: 'end', find: button(k('shift.end')), title: two('End shift', 'শিফট শেষ'), body: two('At closing, tap End shift before you leave. Forgetting it leaves your day open.', 'বন্ধের সময় বেরোনোর আগে শিফট শেষ চাপুন। ভুলে গেলে দিনটা খোলা থেকে যায়।') },
      { id: 'jobs', find: q('[aria-labelledby="home-checklist"]'), optional: true, title: two('Today\'s jobs', 'আজকের কাজ'), body: two('Your jobs for today in order, each with its time. Tap one to go straight to it.', 'আজকের কাজ পরপর, সময়সহ। চাপ দিলে সোজা সেই কাজে।') },
    ],
  },
  {
    id: 'photos', practice: true, minutes: 1,
    title: two('Workplace photos', 'কাজের জায়গার ছবি'),
    about: two('Which photos to take, and when.', 'কোন ছবি তুলবেন, কখন।'),
    steps: [
      { id: 'open', go: 'me', find: button(k('more.myChecks')), act: 'tap', title: two('Tap Workplace photos', 'কাজের জায়গার ছবি চাপুন'), body: two('Me › Workplace photos: today\'s photo checks at the store.', 'আমি › কাজের জায়গার ছবি: দোকানের আজকের ছবি চেক।') },
      { id: 'list', find: text(['Today\'s photos', 'আজকের ছবি']), title: two('Today\'s photos', 'আজকের ছবি'), body: two('Fryer, steamer, crates, the back area: each with its time.', 'ফ্রায়ার, স্টিমার, ক্রেট, পেছনের জায়গা: প্রতিটার সময়সহ।') },
      { id: 'shots', find: text('Oil filtered'), optional: true, title: two('What to show', 'কী দেখা যাবে'), body: two('Each check says what the photo must show. A check with two photos names them, e.g. Top and Inside.', 'প্রতিটা চেকে লেখা ছবিতে কী দেখা যাবে। দুটো ছবির চেকে নাম দেওয়া, যেমন Top আর Inside।') },
      { id: 'opens', find: text(['Opens 3 PM', '3 PM থেকে', 'Opens at', 'থেকে খুলবে']), optional: true, title: two('When it opens', 'কখন খোলে'), body: two('Take it once it opens: tap the photo\'s name and the camera opens. Bunny scores each photo out of 10. (Practice: no photo is sent.)', 'খুললেই তুলুন: ছবির নামে চাপলে ক্যামেরা খোলে। বানি প্রতিটা ছবিকে ১০-এর মধ্যে নম্বর দেয়। (অভ্যাসে ছবি যায় না।)') },
    ],
  },
  {
    id: 'out-of-stock', practice: true, minutes: 1,
    title: two('Something ran out', 'কিছু শেষ হয়ে গেলে'),
    about: two('Log it, and mark it back when stock comes.', 'লিখে রাখুন, মাল এলে আবার চালু করুন।'),
    steps: [
      { id: 'list', go: 'stock/out-of-stock', find: section(k('stock.so.outNow')), title: two('Out right now', 'এখন যা শেষ'), body: two('First switch it off in Ciferon, so Zomato and Swiggy stop taking it. Then log it here.', 'আগে Ciferon-এ বন্ধ করুন, যাতে Zomato আর Swiggy অর্ডার না নেয়। তারপর এখানে লিখুন।') },
      { id: 'mark', find: button(k('stock.so.markOut')), act: 'tap', title: two('Log it', 'লিখে রাখুন'), body: two('Tap the button at the bottom the moment something runs out.', 'কিছু শেষ হওয়ামাত্র নিচের বোতামটা চাপুন।') },
      { id: 'item', find: field(k('stock.so.item'), sheet), act: 'do', ready: () => !!input(k('stock.so.item'), sheet)?.value, title: two('Pick the item', 'জিনিসটা বাছুন'), body: two('Choose what ran out, e.g. Paneer momos.', 'কী শেষ হল বেছে নিন, যেমন Paneer momos।') },
      { id: 'why', find: button(k('stock.soReason.sold_out'), sheet), act: 'tap', title: two('Why did it run out?', 'কেন শেষ হল?'), body: two('Tap Sold out. The reason tells the team what to fix.', 'বিক্রি হয়ে শেষ চাপুন। কারণ দেখে টিম বোঝে কী ঠিক করতে হবে।') },
      { id: 'save', find: button(k('stock.so.markOutButton'), sheet), act: 'tap', title: two('Save it', 'সেভ করুন'), body: two('The incharge, operations and the owner see it straight away.', 'ইনচার্জ, অপারেশনস আর মালিক সঙ্গে সঙ্গে দেখতে পান।') },
      { id: 'back', find: button(k('stock.so.backInStock')), title: two('Back in stock', 'আবার স্টকে'), body: two('When it arrives, tap this straight away, and switch it on in Ciferon.', 'মাল এলেই এটা চাপুন, আর Ciferon-এ চালু করুন।') },
    ],
  },
  {
    id: 'running-low', practice: true, minutes: 1,
    title: two('Running low', 'কিছু কমে আসছে'),
    about: two('Warn the team before something runs out.', 'শেষ হওয়ার আগে টিমকে জানান।'),
    steps: [
      { id: 'card', go: 'home', find: tour('low'), title: two('Running low on something?', 'কিছু কমে আসছে?'), body: two('Boxes, mayonnaise, tissue: tell the team a day or two before it runs out.', 'বাক্স, মেয়োনিজ, টিস্যু: শেষ হওয়ার এক-দুদিন আগে টিমকে জানান।') },
      { id: 'open', find: button(k('supply.flag')), act: 'tap', title: two('Tap Tell the team', 'জানান চাপুন'), body: two('A short form opens.', 'ছোট একটা ফর্ম খুলবে।') },
      { id: 'item', find: field(k('supply.item'), sheet), act: 'do', ready: filled(k('supply.item'), sheet), title: two('What is running low?', 'কী কমে আসছে?'), body: two('Type it, e.g. Tissue paper.', 'লিখুন, যেমন টিস্যু পেপার।') },
      { id: 'send', find: button(k('supply.send', 'common.send'), { ...sheet, exact: true }), act: 'tap', title: two('Send it', 'পাঠিয়ে দিন'), body: two('The incharge, operations and the owner get it, and it goes on the shopping list.', 'ইনচার্জ, অপারেশনস আর মালিক পেয়ে যান, আর বাজারের লিস্টে ওঠে।') },
    ],
  },
  {
    id: 'leave', practice: true, minutes: 2,
    title: two('Attendance and leave', 'হাজিরা আর ছুটি'),
    about: two('Your week, and asking for leave.', 'আপনার সপ্তাহ, আর ছুটি চাওয়া।'),
    steps: [
      { id: 'open', go: 'me', find: button(k('more.myAttendance')), act: 'tap', title: two('Tap Attendance and leave', 'হাজিরা ও ছুটি চাপুন'), body: two('Me › Attendance and leave.', 'আমি › হাজিরা ও ছুটি।') },
      { id: 'week', find: button(k('team.ts.sendWeek')), title: two('Your week', 'আপনার সপ্তাহ'), body: two('Each day\'s times from your shift. Send the week so the incharge can approve it; sending on time is part of your KPI.', 'শিফট থেকে প্রতিদিনের সময়। সপ্তাহ পাঠান, যাতে ইনচার্জ মঞ্জুর করতে পারেন; সময়ে পাঠানো KPI-র অংশ।') },
      { id: 'apply', find: button(k('team.leave.apply')), act: 'tap', title: two('Ask for leave', 'ছুটি চান'), body: two('Tap Apply for leave.', 'ছুটির আবেদন চাপুন।') },
      { id: 'from', find: field(k('team.leave.from'), sheet), act: 'do', ready: filled(k('team.leave.from'), sheet), title: two('Which day', 'কোন দিন'), body: two('Pick the day. For more than one day, pick the last day under To.', 'দিনটা বাছুন। একদিনের বেশি হলে "পর্যন্ত"-তে শেষ দিনটা বাছুন।') },
      { id: 'why', find: field(['Reason', 'কারণ'], sheet), act: 'do', ready: filled(['Reason', 'কারণ'], sheet), title: two('Why', 'কারণ'), body: two('A few words, e.g. Sister\'s wedding.', 'দু-চার কথায়, যেমন বোনের বিয়ে।') },
      { id: 'send', find: button(k('team.leave.submit'), sheet), act: 'tap', title: two('Send it', 'পাঠিয়ে দিন'), body: two('Your incharge approves it. Ask a few days ahead; leave left shows at the top.', 'ইনচার্জ মঞ্জুর করেন। কয়েক দিন আগে চান; কত ছুটি বাকি ওপরে দেখায়।') },
    ],
  },
  {
    id: 'pay', practice: true, minutes: 1,
    title: two('Your pay', 'আপনার বেতন'),
    about: two('What you have earned, and your payslips.', 'কত হল, আর পে-স্লিপ।'),
    steps: [
      { id: 'tab', go: 'home', find: tour('tab-pay'), act: 'tap', title: two('Tap Pay', 'বেতন চাপুন'), body: two('Your money in one place.', 'আপনার টাকার সব এক জায়গায়।') },
      { id: 'month', find: text(k('team.my.thisMonth')), title: two('This month so far', 'এই মাসে এখন পর্যন্ত'), body: two('What you have been paid this month, and when the rest is due.', 'এই মাসে কত পেয়েছেন, আর বাকিটা কবে।') },
      { id: 'slips', find: text(k('team.my.payslips')), title: two('Payslips', 'পে-স্লিপ'), body: two('Each month\'s pay, with any advance taken off. Tap a month for the details.', 'প্রতি মাসের বেতন, অ্যাডভান্স কেটে। মাসে চাপলে বিস্তারিত।') },
    ],
  },
  {
    id: 'kpis', practice: true, minutes: 1,
    title: two('Your KPIs and help', 'আপনার KPI আর সাহায্য'),
    about: two('Your score, and where help is.', 'আপনার স্কোর, আর সাহায্য কোথায়।'),
    steps: [
      { id: 'open', go: 'me', find: button(k('more.myKpis')), act: 'tap', title: two('Tap My KPIs', 'আমার KPI চাপুন'), body: two('Your score this month, and the extra pay it gives.', 'এই মাসের স্কোর, আর তাতে কত বাড়তি টাকা।') },
      { id: 'score', find: text(k('team.kpi.outOf100')), title: two('Out of 100', '১০০-র মধ্যে'), body: two('Attendance, on time, a full shift, the timesheet and clean workplace photos.', 'হাজিরা, সময়ে আসা, পুরো শিফট, টাইমশিট আর পরিষ্কার কাজের জায়গার ছবি।') },
      { id: 'wins', find: text(k('team.kpi.biggestWins')), optional: true, title: two('Biggest wins', 'সবচেয়ে বড় উন্নতি'), body: two('What would raise your score most next time.', 'পরের বার কী করলে স্কোর সবচেয়ে বাড়বে।') },
      { id: 'contacts', go: 'me', find: button(k('more.contacts')), act: 'tap', title: two('Emergency contacts', 'জরুরি যোগাযোগ'), body: two('Police, fire, ambulance, technicians and suppliers, one tap to call.', 'পুলিশ, দমকল, অ্যাম্বুলেন্স, মিস্ত্রি আর সাপ্লায়ার, এক চাপে ফোন।') },
      { id: 'again', go: 'me', find: button(k('more.tour')), optional: true, title: two('Practise again any time', 'যখন খুশি আবার অভ্যাস'), body: two('Me › Learn the app has every chapter.', 'আমি › অ্যাপ শিখুন-এ সব অধ্যায় আছে।') },
    ],
  },
];

const CHAPTERS: Record<string, Chapter[]> = {
  'store-incharge': STORE_INCHARGE,
  'production-incharge': PRODUCTION_INCHARGE,
  operations: OPERATIONS,
  'store-crew': STORE_CREW,
};

/** This role's chapters (none yet: the one-minute tour only). */
export function chaptersFor(persona: string): Chapter[] | null {
  return CHAPTERS[persona] || null;
}
