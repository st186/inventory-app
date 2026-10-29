// The app tour's steps for one login (owner, 29 Oct 2026: "the app itself makes the user hover
// over each of the important features ... with descriptions in Bengali and English both"). Home's
// cards first, top to bottom, then each bottom tab, the top bar, and where to replay the tour.
// A step whose part this person doesn't have (no opening checklist, no shopping list) is passed
// over by the tour.
import type { NavModel, RoleKind } from '../shell/navConfig';

export type Two = { en: string; bn: string };
export type TourStep = { id: string; selector?: string; optional?: boolean; title: Two; body: Two };

const b = (en: string, bn: string): Two => ({ en, bn });
const LEADS: RoleKind[] = ['owner', 'ops'];
const INCHARGES: RoleKind[] = ['store-incharge', 'production-incharge'];

function tabStep(path: string, kind: RoleKind, recipes: boolean): Pick<TourStep, 'title' | 'body'> | null {
  switch (path) {
    case 'stock':
      if (kind === 'store-incharge') return { title: b('Stock', 'স্টক'), body: b('Send tomorrow\'s stock request by midnight, receive the deliveries, and log anything out of stock.', 'কালকের স্টক রিকোয়েস্ট রাত ১২টার মধ্যে পাঠান, মাল রিসিভ করুন, কিছু শেষ হলে লিখুন।') };
      if (kind === 'crew') return { title: b('Stock', 'স্টক'), body: b('Log anything that runs out, and mark it back when it arrives.', 'কিছু শেষ হলে লিখুন, মাল এলে আবার চালু করুন।') };
      return { title: b('Stock', 'স্টক'), body: b('The stores\' requests, production and its approvals, stock on hand and riders.', 'দোকানের রিকোয়েস্ট, প্রোডাকশন আর তার মঞ্জুরি, মজুত আর রাইডার।') };
    case 'production':
      return { title: b('Production', 'প্রোডাকশন'), body: b('Accept the stores\' requests by 9 AM, log each batch, pack and ship by 3 PM, and call a rider.', 'সকাল ৯টার মধ্যে দোকানের রিকোয়েস্ট Accept করুন, প্রতিটা ব্যাচ লিখুন, দুপুর ৩টের মধ্যে প্যাক করে পাঠান, রাইডার ডাকুন।') };
    case 'money':
      if (kind === 'store-incharge') return { title: b('Money', 'টাকা'), body: b('Close the day after closing: sales and cash. Add every expense on the day you pay it.', 'বন্ধের পর দিনের হিসাব: বিক্রি আর ক্যাশ। যেদিন খরচ, সেদিনই লিখুন।') };
      if (kind === 'production-incharge') return { title: b('Money', 'টাকা'), body: b('The production house\'s expenses and cash.', 'প্রোডাকশন হাউসের খরচ আর ক্যাশ।') };
      return { title: b('Money', 'টাকা'), body: b('Sales, expenses, cash and Paytm, payouts and loans.', 'বিক্রি, খরচ, ক্যাশ আর পেটিএম, পেআউট আর লোন।') };
    case 'team':
      if (INCHARGES.includes(kind)) return { title: b('Team', 'টিম'), body: b('Approve the crew\'s timesheets and leave, and look at their workplace photos.', 'স্টাফদের টাইমশিট আর ছুটি মঞ্জুর করুন, ওদের কাজের জায়গার ছবি দেখুন।') };
      return { title: b('Team', 'টিম'), body: b('People, attendance, pay, KPIs and the photo checks.', 'লোকজন, হাজিরা, বেতন, KPI আর ছবি চেক।') };
    case 'insights':
      return { title: b('Insights', 'Insights'), body: b('Profit, food cost, sales by channel and how they are moving.', 'লাভ, খাবারের খরচ, কোথা থেকে কত বিক্রি, আর কোন দিকে যাচ্ছে।') };
    case 'pay':
      return { title: b('Pay', 'বেতন'), body: b('What you have earned this month, your payslips and any advance.', 'এই মাসে কত হল, পে-স্লিপ আর অ্যাডভান্স।') };
    case 'trips':
      return { title: b('Rides', 'রাইড'), body: b('Every ride with its fare.', 'প্রতিটা রাইড আর তার ভাড়া।') };
    case 'me':
      if (kind === 'crew' && recipes) return { title: b('Me', 'আমি'), body: b('Your workplace photos, attendance and leave, KPIs, the recipes to weigh, the photo guide and the emergency numbers.', 'কাজের জায়গার ছবি, হাজিরা আর ছুটি, KPI, ওজন করার রেসিপি, ছবি তোলার নিয়ম আর জরুরি নম্বর।') };
      if (kind === 'crew') return { title: b('Me', 'আমি'), body: b('Your workplace photos, attendance and leave, KPIs, the photo guide and the emergency numbers.', 'কাজের জায়গার ছবি, হাজিরা আর ছুটি, KPI, ছবি তোলার নিয়ম আর জরুরি নম্বর।') };
      return { title: b('Me', 'আমি'), body: b('Your KPIs, attendance and leave, the photo guide and the emergency numbers.', 'আপনার KPI, হাজিরা আর ছুটি, ছবি তোলার নিয়ম আর জরুরি নম্বর।') };
    case 'more':
      return { title: b('More', 'আরও'), body: b('Everything else: shopping lists, setup, reports and the emergency numbers.', 'বাকি সব: বাজারের লিস্ট, সেটআপ, রিপোর্ট আর জরুরি নম্বর।') };
    default:
      return null;
  }
}

export function tourSteps(nav: NavModel): TourStep[] {
  const kind = nav.kind;
  const steps: TourStep[] = [
    { id: 'welcome', title: b('Welcome to Bunny Momos', 'বানি মোমোসে স্বাগত'), body: b('A one-minute look around your app. Tap Next, or tap the lit-up part.', 'এক মিনিটে অ্যাপটা ঘুরে দেখুন। Next চাপুন, বা আলো জ্বলা জায়গায় চাপুন।') },
    { id: 'ride', selector: '[data-tour="ride"]', optional: true, title: b('Your ride', 'আপনার রাইড'), body: b('The ride you are on, with one button for the next step: on my way, arrived, picked up, delivered.', 'এখনকার রাইড, পরের ধাপের একটাই বোতাম: রওনা, পৌঁছনো, মাল নেওয়া, ডেলিভারি।') },
    { id: 'shift', selector: '[data-tour="shift"]', optional: true, title: b('Your shift', 'আপনার শিফট'), body: b('Tap Start shift when you arrive and End shift when you leave. This is your attendance.', 'পৌঁছে Start shift, যাওয়ার সময় End shift চাপুন। এটাই আপনার হাজিরা।') },
    { id: 'opening', selector: '[data-tour="opening"]', optional: true, title: b('Opening checklist', 'দোকান খোলার চেকলিস্ট'), body: b('Tick each item as soon as it is ready, by 4 PM.', 'প্রতিটা জিনিস তৈরি হলেই টিক দিন, বিকেল ৪টের মধ্যে।') },
    LEADS.includes(kind)
      ? { id: 'shopping', selector: '[data-tour="shopping"]', optional: true, title: b('Shopping', 'বাজার'), body: b('Write tomorrow\'s list, send each vendor their part on WhatsApp, and price it into the expenses after the shopping.', 'কালকের লিস্ট বানান, প্রতিটা ভেন্ডরকে WhatsApp-এ তার অংশ পাঠান, বাজারের পর দাম খরচে তুলুন।') }
      : { id: 'shopping', selector: '[data-tour="shopping"]', optional: true, title: b('The shopping list', 'বাজারের লিস্ট'), body: b('Operations sends the list the night before. In the morning, mark each item as you get it and photograph the bills.', 'অপারেশনস আগের রাতে লিস্ট পাঠায়। সকালে প্রতিটা জিনিস পেলেই দাগ দিন, বিলের ছবি তুলুন।') },
    { id: 'low', selector: '[data-tour="low"]', optional: true, title: b('Running low?', 'কিছু কমে আসছে?'), body: b('Tell the team before something runs out. Operations puts it on the shopping list.', 'শেষ হওয়ার আগে টিমকে জানান। অপারেশনস বাজারের লিস্টে তুলে দেয়।') },
    { id: 'attention', selector: '[aria-labelledby="home-attention"]', optional: true, title: b('Needs your attention', 'আপনার দেখার জিনিস'), body: b('Everything waiting for your answer, most urgent first. Tap one to deal with it.', 'যা যা আপনার উত্তরের অপেক্ষায়, জরুরিটা আগে। চাপ দিয়ে সেরে ফেলুন।') },
    { id: 'checklist', selector: '[aria-labelledby="home-checklist"]', optional: true, title: b('Today\'s jobs', 'আজকের কাজ'), body: b('Your jobs for today in order, each with its time. Tap one to go straight to it.', 'আজকের কাজ পরপর, সময়সহ। চাপ দিলে সোজা সেই কাজে।') },
  ];
  const recipes = nav.more.some((g) => g.items.includes('recipes'));
  for (const tab of nav.tabs) {
    const text = tab.path === 'home' ? null : tabStep(tab.path, kind, recipes);
    if (text) steps.push({ id: `tab-${tab.path}`, selector: `[data-tour="tab-${tab.path}"]`, optional: true, ...text });
  }
  steps.push({ id: 'inbox', selector: '[data-tour="inbox"]', optional: true, title: b('Notifications', 'নোটিফিকেশন'), body: b('New requests, reminders and approvals. The red number is how many are new.', 'নতুন রিকোয়েস্ট, মনে করানো আর মঞ্জুরি। লাল সংখ্যা মানে কতগুলো নতুন।') });
  if (nav.chrome.askBunny) {
    steps.push({ id: 'ask-bunny', selector: '[data-tour="ask-bunny"]', optional: true, title: b('Ask Bunny', 'বানিকে জিজ্ঞেস করুন'), body: b('Ask anything about sales, stock or money in plain words. Bengali is fine.', 'বিক্রি, স্টক বা টাকা নিয়ে সহজ কথায় যা খুশি জিজ্ঞেস করুন। বাংলায় চলবে।') });
  }
  steps.push({ id: 'account', selector: '[data-tour="account"]', optional: true, title: b('Your account', 'আপনার অ্যাকাউন্ট'), body: b('The app\'s language (বাংলা, English, हिन्दी), a dark screen, and your password.', 'অ্যাপের ভাষা (বাংলা, English, हिन्दी), অন্ধকার স্ক্রিন আর পাসওয়ার্ড।') });
  const list = nav.tabs.some((tab) => tab.path === 'me') ? 'me' : 'more';
  steps.push({
    id: 'again', selector: `[data-tour="tab-${list}"]`,
    title: b('See this again any time', 'আবার দেখতে চাইলে'),
    body: list === 'me'
      ? b('Open Me › Learn the app to play this tour again.', 'Me › Learn the app খুলে এই পরিচিতি আবার দেখুন।')
      : b('Open More › Learn the app to play this tour again.', 'More › Learn the app খুলে এই পরিচিতি আবার দেখুন।'),
  });
  return steps;
}
