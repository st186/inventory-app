// One-language labels for the app. Each person's language is their Bunny language
// (utils/bunnyLanguage.ts, chosen in the Account sheet), so a label shows in English, Bengali
// or Hindi - never "English · বাংলা" doubled. Missing Bengali/Hindi strings fall back to English.
//
//   const { t, lang } = useT();
//   <Button>{t('common.save')}</Button>
//   t('common.seeAll', { n: 7 })        -> "See all (7)"
//
// Outside React (toasts fired from plain functions) use t(key) - it reads the saved language.
// Put lang={lang} on a container whose text is translated, so Bengali/Hindi get their
// taller line-height (globals.css) and screen readers pick the right voice.
import { createContext, createElement, useCallback, useContext, type ReactNode } from 'react';
import { getBunnyLanguage, useBunnyLanguage, type BunnyLanguage } from './bunnyLanguage';

export type Lang = BunnyLanguage;

const en = {
  // Navigation
  'nav.home': 'Home',
  'nav.insights': 'Insights',
  'nav.stock': 'Stock',
  'nav.money': 'Money',
  'nav.team': 'Team',
  'nav.more': 'More',
  'nav.me': 'Me',
  'nav.pay': 'Pay',
  'nav.production': 'Production',
  'nav.today': 'Today',
  'nav.inbox': 'Notifications',
  'nav.askBunny': 'Ask Bunny',
  'nav.main': 'Main',

  // Common actions
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.send': 'Send',
  'common.done': 'Done',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.retry': 'Try again',
  'common.search': 'Search',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.add': 'Add',
  'common.apply': 'Apply',
  'common.confirm': 'Confirm',
  'common.select': 'Select',
  'common.change': 'Change',
  'common.seeAll': 'See all ({n})',
  'common.loading': 'Loading',
  'common.optional': 'Optional',
  'common.required': 'Required',
  'common.keepEditing': 'Keep editing',
  'common.discard': 'Discard',
  'common.discardTitle': 'Discard your changes?',
  'common.discardBody': 'What you typed will be lost.',
  'common.noResults': 'Nothing matches "{q}"',
  'common.addNew': 'Add "{q}"',
  'common.typeToNarrow': 'Showing the first {n}. Type to narrow down.',
  'common.selectedCount': '{n} selected',
  'common.less': 'Less {label}',
  'common.more': 'More {label}',
  'common.moreActions': 'More actions',
  'common.typeToConfirm': 'Type {word} to confirm',
  'common.newCount': '{n} new',

  // Status words (always shown with the chip colour, never colour alone)
  'status.due': 'Due',
  'status.late': 'Late',
  'status.paid': 'Paid',
  'status.partlyPaid': 'Partly paid',
  'status.done': 'Done',
  'status.later': 'Later',
  'status.waitingToSend': 'Waiting to send',
  'status.notSent': 'Not sent',
  'status.draft': 'Draft',
  'status.sent': 'Sent',
  'status.packed': 'Packed',
  'status.onTheWay': 'On the way',
  'status.received': 'Received',
  'status.pending': 'Waiting',
  'status.approved': 'Approved',
  'status.rejected': 'Rejected',
  'status.matched': 'Matched',
  'status.short': 'Short {amount}',
  'status.excess': 'Excess {amount}',
  'status.onTrack': 'On track',
  'status.belowUsual': 'Below usual',
  'status.complete': 'Complete',
  'status.on': 'On',
  'status.off': 'Off',
  'status.notStarted': 'Not started',
  'status.onShift': 'On shift',

  // Shift
  'shift.yours': 'Your shift',
  'shift.start': 'Start shift',
  'shift.end': 'End shift',
  'shift.whyLocation': 'Why location?',

  // Dates
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',
  'date.tomorrow': 'Tomorrow',
  'date.pick': 'Pick another date',
  'date.pickTitle': 'Pick a date',
  'date.rangeTitle': 'Dates',
  'date.thisWeek': 'This week',
  'date.thisMonth': 'This month',
  'date.lastMonth': 'Last month',
  'date.last6Months': 'Last 6 months',
  'date.thisYear': 'This year',
  'date.custom': 'Custom dates',
  'date.from': 'From',
  'date.to': 'To',
  'date.prevMonth': 'Previous month',
  'date.nextMonth': 'Next month',
  'date.wd.0': 'Sun',
  'date.wd.1': 'Mon',
  'date.wd.2': 'Tue',
  'date.wd.3': 'Wed',
  'date.wd.4': 'Thu',
  'date.wd.5': 'Fri',
  'date.wd.6': 'Sat',
  'date.m.0': 'January',
  'date.m.1': 'February',
  'date.m.2': 'March',
  'date.m.3': 'April',
  'date.m.4': 'May',
  'date.m.5': 'June',
  'date.m.6': 'July',
  'date.m.7': 'August',
  'date.m.8': 'September',
  'date.m.9': 'October',
  'date.m.10': 'November',
  'date.m.11': 'December',
  'date.ms.0': 'Jan',
  'date.ms.1': 'Feb',
  'date.ms.2': 'Mar',
  'date.ms.3': 'Apr',
  'date.ms.4': 'May',
  'date.ms.5': 'Jun',
  'date.ms.6': 'Jul',
  'date.ms.7': 'Aug',
  'date.ms.8': 'Sep',
  'date.ms.9': 'Oct',
  'date.ms.10': 'Nov',
  'date.ms.11': 'Dec',

  // Money
  'money.amount': 'Amount',
  'money.paidFrom': 'Paid from',
  'money.cash': 'Cash',
  'money.paytm': 'Paytm',
  'money.split': 'Split',

  // Voice
  'voice.speak': 'Speak',
  'voice.sayItInstead': 'Say it instead',

  // Errors and empty states
  'error.title': "Couldn't load this",
  'error.body': 'Check the internet and try again.',
  'empty.allCaughtUp': 'All caught up',

  // Account
  'account.yours': 'Your account',
  'account.profile': 'My profile',
  'account.language': 'Language',
  'account.notifications': 'Notifications',
  'account.changePassword': 'Change password',
  'account.logout': 'Log out',

  // Home / day work
  'home.needsAttention': 'Needs your attention',
  'home.checklist': "Today's checklist",
  'home.doneToday': 'Done today ({n})',
  'home.progress': '{done} of {total} done',
  'home.atAGlance': 'At a glance',
  'home.salesToday': 'Sales today',
  'home.spentToday': 'Spent today',
  'dayClose.send': 'Send day close',
  'dayClose.saveDraft': 'Save draft',
  'request.send': 'Send request',
  'request.copyYesterday': 'Copy yesterday',
  'expense.add': 'Add expense',
  'expense.save': 'Save expense',
  'expense.saveAnother': 'Save + another',
} as const;

export type I18nKey = keyof typeof en;
type Dict = Partial<Record<I18nKey, string>>;

const bn: Dict = {
  'nav.home': 'হোম',
  'nav.insights': 'বিশ্লেষণ',
  'nav.stock': 'স্টক',
  'nav.money': 'টাকা',
  'nav.team': 'টিম',
  'nav.more': 'আরও',
  'nav.me': 'আমি',
  'nav.pay': 'বেতন',
  'nav.production': 'প্রোডাকশন',
  'nav.today': 'আজ',
  'nav.inbox': 'নোটিফিকেশন',
  'nav.askBunny': 'বানিকে জিজ্ঞেস করুন',
  'nav.main': 'মেনু',

  'common.save': 'সেভ করুন',
  'common.cancel': 'বাতিল',
  'common.send': 'পাঠান',
  'common.done': 'হয়ে গেছে',
  'common.close': 'বন্ধ করুন',
  'common.back': 'পিছনে',
  'common.retry': 'আবার চেষ্টা করুন',
  'common.search': 'খুঁজুন',
  'common.edit': 'বদলান',
  'common.delete': 'মুছে ফেলুন',
  'common.add': 'যোগ করুন',
  'common.apply': 'প্রয়োগ করুন',
  'common.confirm': 'নিশ্চিত করুন',
  'common.select': 'বেছে নিন',
  'common.change': 'বদলান',
  'common.seeAll': 'সব দেখুন ({n})',
  'common.loading': 'লোড হচ্ছে',
  'common.optional': 'ঐচ্ছিক',
  'common.required': 'আবশ্যক',
  'common.keepEditing': 'চালিয়ে যান',
  'common.discard': 'বাদ দিন',
  'common.discardTitle': 'পরিবর্তনগুলো বাদ দেবেন?',
  'common.discardBody': 'যা লিখেছেন তা মুছে যাবে।',
  'common.noResults': '"{q}" এর সাথে কিছু মেলেনি',
  'common.addNew': '"{q}" যোগ করুন',
  'common.typeToNarrow': 'প্রথম {n}টি দেখানো হচ্ছে। আরও লিখে খুঁজুন।',
  'common.selectedCount': '{n}টি বেছে নেওয়া হয়েছে',
  'common.less': '{label} কমান',
  'common.more': '{label} বাড়ান',
  'common.moreActions': 'আরও কাজ',
  'common.typeToConfirm': 'নিশ্চিত করতে {word} লিখুন',
  'common.newCount': '{n}টি নতুন',

  'status.due': 'বাকি',
  'status.late': 'দেরি',
  'status.paid': 'দেওয়া হয়েছে',
  'status.partlyPaid': 'কিছুটা দেওয়া হয়েছে',
  'status.done': 'হয়ে গেছে',
  'status.later': 'পরে',
  'status.waitingToSend': 'পাঠানোর অপেক্ষায়',
  'status.notSent': 'পাঠানো হয়নি',
  'status.draft': 'খসড়া',
  'status.sent': 'পাঠানো হয়েছে',
  'status.packed': 'প্যাক হয়েছে',
  'status.onTheWay': 'পথে আছে',
  'status.received': 'পৌঁছেছে',
  'status.pending': 'অপেক্ষায়',
  'status.approved': 'অনুমোদিত',
  'status.rejected': 'নামঞ্জুর',
  'status.matched': 'মিলেছে',
  'status.short': '{amount} কম',
  'status.excess': '{amount} বেশি',
  'status.onTrack': 'ঠিকঠাক চলছে',
  'status.belowUsual': 'স্বাভাবিকের চেয়ে কম',
  'status.complete': 'সম্পূর্ণ',
  'status.on': 'চালু',
  'status.off': 'বন্ধ',
  'status.notStarted': 'শুরু হয়নি',
  'status.onShift': 'শিফটে আছেন',

  'shift.yours': 'আপনার শিফট',
  'shift.start': 'শিফট শুরু করুন',
  'shift.end': 'শিফট শেষ করুন',
  'shift.whyLocation': 'লোকেশন কেন?',

  'date.today': 'আজ',
  'date.yesterday': 'গতকাল',
  'date.tomorrow': 'আগামীকাল',
  'date.pick': 'অন্য তারিখ বেছে নিন',
  'date.pickTitle': 'তারিখ বেছে নিন',
  'date.rangeTitle': 'তারিখ',
  'date.thisWeek': 'এই সপ্তাহ',
  'date.thisMonth': 'এই মাস',
  'date.lastMonth': 'গত মাস',
  'date.last6Months': 'গত ৬ মাস',
  'date.thisYear': 'এই বছর',
  'date.custom': 'নিজের মতো তারিখ',
  'date.from': 'থেকে',
  'date.to': 'পর্যন্ত',
  'date.prevMonth': 'আগের মাস',
  'date.nextMonth': 'পরের মাস',
  'date.wd.0': 'রবি',
  'date.wd.1': 'সোম',
  'date.wd.2': 'মঙ্গল',
  'date.wd.3': 'বুধ',
  'date.wd.4': 'বৃহঃ',
  'date.wd.5': 'শুক্র',
  'date.wd.6': 'শনি',
  'date.m.0': 'জানুয়ারি',
  'date.m.1': 'ফেব্রুয়ারি',
  'date.m.2': 'মার্চ',
  'date.m.3': 'এপ্রিল',
  'date.m.4': 'মে',
  'date.m.5': 'জুন',
  'date.m.6': 'জুলাই',
  'date.m.7': 'আগস্ট',
  'date.m.8': 'সেপ্টেম্বর',
  'date.m.9': 'অক্টোবর',
  'date.m.10': 'নভেম্বর',
  'date.m.11': 'ডিসেম্বর',
  'date.ms.0': 'জানু',
  'date.ms.1': 'ফেব্রু',
  'date.ms.2': 'মার্চ',
  'date.ms.3': 'এপ্রিল',
  'date.ms.4': 'মে',
  'date.ms.5': 'জুন',
  'date.ms.6': 'জুলাই',
  'date.ms.7': 'আগস্ট',
  'date.ms.8': 'সেপ্টে',
  'date.ms.9': 'অক্টো',
  'date.ms.10': 'নভে',
  'date.ms.11': 'ডিসে',

  'money.amount': 'টাকার পরিমাণ',
  'money.paidFrom': 'কোথা থেকে দিলেন',
  'money.cash': 'ক্যাশ',
  'money.paytm': 'পেটিএম',
  'money.split': 'ভাগ করে',

  'voice.speak': 'বলুন',
  'voice.sayItInstead': 'মুখে বলুন',

  'error.title': 'লোড করা যায়নি',
  'error.body': 'ইন্টারনেট দেখে আবার চেষ্টা করুন।',
  'empty.allCaughtUp': 'সব কাজ হয়ে গেছে',

  'account.yours': 'আপনার অ্যাকাউন্ট',
  'account.profile': 'আমার প্রোফাইল',
  'account.language': 'ভাষা',
  'account.notifications': 'নোটিফিকেশন',
  'account.changePassword': 'পাসওয়ার্ড বদলান',
  'account.logout': 'লগ আউট',

  'home.needsAttention': 'আপনার নজর দরকার',
  'home.checklist': 'আজকের কাজ',
  'home.doneToday': 'আজ হয়ে গেছে ({n})',
  'home.progress': '{total}টির মধ্যে {done}টি হয়েছে',
  'home.atAGlance': 'এক নজরে',
  'home.salesToday': 'আজকের বিক্রি',
  'home.spentToday': 'আজকের খরচ',
  'dayClose.send': 'দিনের হিসাব পাঠান',
  'dayClose.saveDraft': 'খসড়া রাখুন',
  'request.send': 'রিকোয়েস্ট পাঠান',
  'request.copyYesterday': 'গতকালেরটা নিন',
  'expense.add': 'খরচ যোগ করুন',
  'expense.save': 'খরচ সেভ করুন',
  'expense.saveAnother': 'সেভ + আরেকটা',
};

const hi: Dict = {
  'nav.home': 'होम',
  'nav.insights': 'विश्लेषण',
  'nav.stock': 'स्टॉक',
  'nav.money': 'पैसे',
  'nav.team': 'टीम',
  'nav.more': 'और',
  'nav.me': 'मैं',
  'nav.pay': 'वेतन',
  'nav.production': 'प्रोडक्शन',
  'nav.today': 'आज',
  'nav.inbox': 'सूचनाएँ',
  'nav.askBunny': 'बनी से पूछें',
  'nav.main': 'मेन्यू',

  'common.save': 'सेव करें',
  'common.cancel': 'रद्द करें',
  'common.send': 'भेजें',
  'common.done': 'हो गया',
  'common.close': 'बंद करें',
  'common.back': 'वापस',
  'common.retry': 'फिर से कोशिश करें',
  'common.search': 'खोजें',
  'common.edit': 'बदलें',
  'common.delete': 'हटाएँ',
  'common.add': 'जोड़ें',
  'common.apply': 'लागू करें',
  'common.confirm': 'पक्का करें',
  'common.select': 'चुनें',
  'common.change': 'बदलें',
  'common.seeAll': 'सब देखें ({n})',
  'common.loading': 'लोड हो रहा है',
  'common.optional': 'वैकल्पिक',
  'common.required': 'ज़रूरी',
  'common.keepEditing': 'जारी रखें',
  'common.discard': 'छोड़ दें',
  'common.discardTitle': 'बदलाव छोड़ दें?',
  'common.discardBody': 'आपने जो लिखा है वह मिट जाएगा।',
  'common.noResults': '"{q}" से कुछ नहीं मिला',
  'common.addNew': '"{q}" जोड़ें',
  'common.typeToNarrow': 'पहले {n} दिख रहे हैं। और लिखकर खोजें।',
  'common.selectedCount': '{n} चुने गए',
  'common.less': '{label} कम करें',
  'common.more': '{label} बढ़ाएँ',
  'common.moreActions': 'और काम',
  'common.typeToConfirm': 'पक्का करने के लिए {word} लिखें',
  'common.newCount': '{n} नए',

  'status.due': 'बाकी',
  'status.late': 'देर',
  'status.paid': 'भुगतान हुआ',
  'status.partlyPaid': 'आंशिक भुगतान',
  'status.done': 'हो गया',
  'status.later': 'बाद में',
  'status.waitingToSend': 'भेजने का इंतज़ार',
  'status.notSent': 'नहीं भेजा',
  'status.draft': 'ड्राफ्ट',
  'status.sent': 'भेज दिया',
  'status.packed': 'पैक हो गया',
  'status.onTheWay': 'रास्ते में',
  'status.received': 'मिल गया',
  'status.pending': 'इंतज़ार में',
  'status.approved': 'मंज़ूर',
  'status.rejected': 'नामंज़ूर',
  'status.matched': 'मिल गया',
  'status.short': '{amount} कम',
  'status.excess': '{amount} ज़्यादा',
  'status.onTrack': 'ठीक चल रहा है',
  'status.belowUsual': 'सामान्य से कम',
  'status.complete': 'पूरा',
  'status.on': 'चालू',
  'status.off': 'बंद',
  'status.notStarted': 'शुरू नहीं हुई',
  'status.onShift': 'शिफ्ट पर',

  'shift.yours': 'आपकी शिफ्ट',
  'shift.start': 'शिफ्ट शुरू करें',
  'shift.end': 'शिफ्ट ख़त्म करें',
  'shift.whyLocation': 'लोकेशन क्यों?',

  'date.today': 'आज',
  'date.yesterday': 'कल',
  'date.tomorrow': 'आने वाला कल',
  'date.pick': 'दूसरी तारीख़ चुनें',
  'date.pickTitle': 'तारीख़ चुनें',
  'date.rangeTitle': 'तारीख़ें',
  'date.thisWeek': 'इस हफ़्ते',
  'date.thisMonth': 'इस महीने',
  'date.lastMonth': 'पिछले महीने',
  'date.last6Months': 'पिछले 6 महीने',
  'date.thisYear': 'इस साल',
  'date.custom': 'अपनी तारीख़ें',
  'date.from': 'से',
  'date.to': 'तक',
  'date.prevMonth': 'पिछला महीना',
  'date.nextMonth': 'अगला महीना',
  'date.wd.0': 'रवि',
  'date.wd.1': 'सोम',
  'date.wd.2': 'मंगल',
  'date.wd.3': 'बुध',
  'date.wd.4': 'गुरु',
  'date.wd.5': 'शुक्र',
  'date.wd.6': 'शनि',
  'date.m.0': 'जनवरी',
  'date.m.1': 'फ़रवरी',
  'date.m.2': 'मार्च',
  'date.m.3': 'अप्रैल',
  'date.m.4': 'मई',
  'date.m.5': 'जून',
  'date.m.6': 'जुलाई',
  'date.m.7': 'अगस्त',
  'date.m.8': 'सितंबर',
  'date.m.9': 'अक्टूबर',
  'date.m.10': 'नवंबर',
  'date.m.11': 'दिसंबर',
  'date.ms.0': 'जन',
  'date.ms.1': 'फ़र',
  'date.ms.2': 'मार्च',
  'date.ms.3': 'अप्रै',
  'date.ms.4': 'मई',
  'date.ms.5': 'जून',
  'date.ms.6': 'जुला',
  'date.ms.7': 'अग',
  'date.ms.8': 'सितं',
  'date.ms.9': 'अक्टू',
  'date.ms.10': 'नवं',
  'date.ms.11': 'दिसं',

  'money.amount': 'रकम',
  'money.paidFrom': 'किससे दिया',
  'money.cash': 'नकद',
  'money.paytm': 'पेटीएम',
  'money.split': 'बाँटकर',

  'voice.speak': 'बोलें',
  'voice.sayItInstead': 'बोलकर बताएँ',

  'error.title': 'लोड नहीं हो सका',
  'error.body': 'इंटरनेट देखें और फिर से कोशिश करें।',
  'empty.allCaughtUp': 'सब काम हो गए',

  'account.yours': 'आपका खाता',
  'account.profile': 'मेरी प्रोफ़ाइल',
  'account.language': 'भाषा',
  'account.notifications': 'सूचनाएँ',
  'account.changePassword': 'पासवर्ड बदलें',
  'account.logout': 'लॉग आउट',

  'home.needsAttention': 'आपका ध्यान चाहिए',
  'home.checklist': 'आज के काम',
  'home.doneToday': 'आज पूरे हुए ({n})',
  'home.progress': '{total} में से {done} पूरे',
  'home.atAGlance': 'एक नज़र में',
  'home.salesToday': 'आज की बिक्री',
  'home.spentToday': 'आज का खर्च',
  'dayClose.send': 'दिन का हिसाब भेजें',
  'dayClose.saveDraft': 'ड्राफ्ट सेव करें',
  'request.send': 'रिक्वेस्ट भेजें',
  'request.copyYesterday': 'कल वाली लें',
  'expense.add': 'खर्च जोड़ें',
  'expense.save': 'खर्च सेव करें',
  'expense.saveAnother': 'सेव + एक और',
};

const DICTIONARIES: Record<Lang, Dict> = { en, bn, hi };

export type I18nVars = Record<string, string | number>;

function interpolate(text: string, vars?: I18nVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** The label for `key` in `lang`, English when that language has no string yet. */
export function translate(lang: Lang, key: I18nKey, vars?: I18nVars): string {
  return interpolate(DICTIONARIES[lang]?.[key] ?? en[key] ?? key, vars);
}

/** Outside React: the label in the person's saved language. */
export function t(key: I18nKey, vars?: I18nVars): string {
  return translate(getBunnyLanguage(), key, vars);
}

/** Does a dictionary have its own string for this key (not the English fallback)? */
export function hasTranslation(lang: Lang, key: I18nKey): boolean {
  return Boolean(DICTIONARIES[lang]?.[key]);
}

const LanguageOverrideContext = createContext<Lang | null>(null);

/** Forces a language for a subtree (the UI gallery shows English and Bengali side by side). */
export function LanguageOverride({ lang, children }: { lang: Lang; children?: ReactNode }) {
  return createElement(LanguageOverrideContext.Provider, { value: lang }, children);
}

/** The language labels should render in: an override if one is set, else the person's language. */
export function useLang(): Lang {
  const [saved] = useBunnyLanguage();
  const override = useContext(LanguageOverrideContext);
  return override ?? saved;
}

export function useT(): { t: (key: I18nKey, vars?: I18nVars) => string; lang: Lang } {
  const lang = useLang();
  const tr = useCallback((key: I18nKey, vars?: I18nVars) => translate(lang, key, vars), [lang]);
  return { t: tr, lang };
}

/** True when text contains Bengali or Devanagari letters (overline caps/tracking are Latin-only). */
export function isIndicText(text: string): boolean {
  return /[ऀ-৿]/.test(text);
}
