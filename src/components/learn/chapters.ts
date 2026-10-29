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
import { button, field, filled, input, section, text, topSheet, tour, type Find } from './find';

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

const CHAPTERS: Record<string, Chapter[]> = {
  'store-incharge': STORE_INCHARGE,
};

/** This role's chapters (none yet: the one-minute tour only). */
export function chaptersFor(persona: string): Chapter[] | null {
  return CHAPTERS[persona] || null;
}
