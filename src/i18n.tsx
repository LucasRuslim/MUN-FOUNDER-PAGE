import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/* ═══ Language ═══════════════════════════════════════════════════
   Two languages, one dictionary, no interpolation library. Every key is a
   pair; anything a member typed themselves (names, bios, grades) is never
   translated, because we would only be guessing at it.

   Traditional Chinese is not a transliteration of the English here. The MUN
   copy in particular is written in Chinese rather than converted from it, so
   it reads like a club notice instead of machine output.
════════════════════════════════════════════════════════════════ */

export type Lang = 'en' | 'zh';

const STORE_KEY = 'youhua-mun-lang';

type Entry = { en: string; zh: string };

export const DICT = {
  /* ── chrome ── */
  'nav.menu':        { en: 'Menu',            zh: '選單' },
  'nav.council':     { en: 'The Council',     zh: '理事會' },
  'nav.members':     { en: '{n} in the council', zh: '理事會現有 {n} 人' },
  'nav.lang':        { en: '中文',            zh: 'EN' },
  'nav.langLabel':   { en: 'Switch to Traditional Chinese', zh: 'Switch to English' },
  'nav.login':       { en: 'Member Login',    zh: '成員登入' },
  'nav.editProfile': { en: 'Edit Profile',    zh: '編輯個人檔案' },
  'nav.scroll':      { en: 'Scroll',          zh: '向下捲動' },
  'nav.sound':       { en: 'Ambience',        zh: '環境音' },
  'nav.soundOn':     { en: 'Sound On',        zh: '音效開啟' },
  'nav.close':       { en: 'Close menu',      zh: '關閉選單' },

  /* ── chapters ── */
  'ch.hero':         { en: 'The Chamber',     zh: '議場' },
  'ch.about':        { en: 'What MUN Is',     zh: '什麼是模擬聯合國' },
  'ch.council':      { en: 'The Council',     zh: '理事會' },
  'ch.offices':      { en: 'The Secretariat', zh: '秘書處' },

  /* ── hero ── */
  'hero.eyebrow':    { en: 'Youhua School · Model United Nations', zh: '友華中學 · 模擬聯合國' },
  'hero.title':      { en: 'Take Your Seat At The Table.', zh: '在這張桌前坐下。' },
  'hero.sub':        { en: 'A committee is a room where students argue for countries that are not their own, and have to persuade each other anyway.',
                       zh: '模擬聯合國，就是學生代表並非自己國家的立場，在同一個議場裡彼此說服。' },
  'hero.cta':        { en: 'Join The Council →', zh: '加入理事會 →' },
  'hero.ctaSub':     { en: 'Open to any Youhua student. No experience needed.', zh: '友華中學學生皆可加入，無需任何經驗。' },
  'hero.ctaSeated':  { en: 'See Your Seat →',  zh: '查看你的席位 →' },
  'hero.welcome':    { en: 'Welcome back, {name}. You are seat {n}.', zh: '{name}，歡迎回來。你的席位是第 {n} 號。' },
  'hero.tally':      { en: 'delegates seated', zh: '位代表已就座' },
  'hero.tallyOne':   { en: 'delegate seated',  zh: '位代表已就座' },

  /* ── what MUN is ── */
  'mun.title1':      { en: 'What Model',      zh: '什麼是' },
  'mun.titleAccent': { en: 'United Nations',  zh: '模擬聯合國' },
  'mun.title2':      { en: 'actually is',     zh: '？' },
  'mun.lede':        { en: 'You are assigned a country. You read what it actually argues at the United Nations on a real question, and then you spend a session defending that position in a room of people doing the same for theirs.',
                       zh: '你會被指派一個國家。你要研究這個國家在聯合國對某項真實議題的實際立場，然後在一場會議中為它辯護，而在場每個人都在為自己代表的國家做同樣的事。' },

  'un.title1':       { en: 'And what the',    zh: '那麼，' },
  'un.titleAccent':  { en: 'United Nations',  zh: '聯合國' },
  'un.title2':       { en: 'is',              zh: '又是什麼？' },
  'un.lede':         { en: 'Founded in 1945 by fifty-one countries after the Second World War, and now numbering 193. It is not a world government and cannot make law. It is the room those 193 states agreed to keep talking in.',
                       zh: '聯合國於一九四五年二戰結束後由五十一個國家創立，目前共有一百九十三個會員國。它不是世界政府，也無權立法；它是這一百九十三個國家同意持續對話的那個場所。' },

  'mun.p1.term':     { en: 'A committee',     zh: '委員會' },
  'mun.p1.desc':     { en: 'Every session sits as one of the UN’s real bodies: the General Assembly, where all 193 states get one vote each, or a council like the Security Council, where fifteen states carry the file and five of them can veto it.',
                       zh: '每場會議都會模擬聯合國的真實機構：可能是一百九十三國各有一票的大會，也可能是像安全理事會這樣由十五個國家審議、其中五國握有否決權的理事會。' },
  'mun.p2.term':     { en: 'A position',      zh: '立場' },
  'mun.p2.desc':     { en: 'You do not argue what you believe. You argue what your country has actually said, which you find by reading what its delegates really put on the record. Learning to hold a position you did not choose is the whole exercise.',
                       zh: '你辯護的不是自己的信念，而是你所代表國家真正表達過的立場，這需要你去閱讀該國代表實際留下的發言紀錄。學會為一個不是自己選擇的立場辯護，正是這項訓練的核心。' },
  'mun.p3.term':     { en: 'A resolution',    zh: '決議' },
  'mun.p3.desc':     { en: 'The session ends in a written text that has to pass. Getting there means finding the wording enough delegates who disagree can still sign, which is a harder and more useful skill than winning an argument.',
                       zh: '會議最後會產出一份必須通過的書面文件。要走到那一步，你得找出讓意見相左的代表們仍願共同簽署的措辭，這比贏得一場辯論更困難，也更有用。' },

  /* ── council ── */
  'council.title1':  { en: 'The',             zh: '' },
  'council.accent':  { en: 'Council',         zh: '理事會' },
  'council.sub':     { en: 'Everyone who has joined, seated around the table. Select any seat to read that member.',
                       zh: '所有已加入的成員，環桌就座。點選任一席位即可查看該成員資料。' },
  'council.empty':   { en: 'The table is set and the seats are open. Be the first to sit.',
                       zh: '長桌已備妥，席位全數開放。成為第一位入座的人。' },
  'council.head':    { en: 'Head of Council',  zh: '理事會主席' },
  'council.seat':    { en: 'Seat {n}',         zh: '第 {n} 號席位' },
  'council.arrange': { en: 'Arrange Seats',    zh: '調整席位' },
  'council.besties': { en: 'Besties',          zh: '好友配對' },
  'council.offices': { en: 'Assign Office',    zh: '指派職務' },
  'council.hintArrange': { en: 'Select two members to swap their seats.', zh: '選擇兩位成員即可交換席位。' },
  'council.hintBestie':  { en: 'Select two members to pair them.', zh: '選擇兩位成員即可配對。' },
  'council.hintOffice':  { en: 'Select one member, then choose an office.', zh: '先選擇一位成員，再指定職務。' },
  'council.pair':    { en: 'Pair',             zh: '配對' },
  'council.unpair':  { en: 'Unpair',           zh: '取消配對' },

  /* ── secretariat ── */
  'off.title1':      { en: 'The',              zh: '' },
  'off.accent':      { en: 'Secretariat',      zh: '秘書處' },
  'off.sub':         { en: 'The offices that run the club between sessions. Every office is an equal seat.',
                       zh: '在會議之間維持社團運作的各項職務。每個職務都是平等的一席。' },
  'off.heldBy':      { en: 'Held by',          zh: '現任' },
  'off.vacant':      { en: 'Seat unassigned',  zh: '職務從缺' },

  /* ── roles ── */
  'role.president.en':  { en: 'The Presidents',           zh: '正副社長' },
  'role.president.duty':{ en: 'Two chairs, one gavel. They run the council and speak for the club.',
                          zh: '兩位主席，共執一槌。主持理事會議並對外代表社團。' },
  'role.events.en':     { en: 'Directorate of Events',    zh: '活動' },
  'role.events.duty':   { en: 'Designs every session, conference and occasion the club holds.',
                          zh: '規劃社團所有會議、大會與各項活動。' },
  'role.treasury.en':   { en: 'Directorate of Treasury',  zh: '總務' },
  'role.treasury.duty': { en: 'Keeps the ledger, the budget, and the club’s resources in order.',
                          zh: '掌理帳目、預算與社團資源。' },
  'role.academics.en':  { en: 'Directorate of Academics', zh: '教學' },
  'role.academics.duty':{ en: 'Trains delegates in procedure, research and the art of debate.',
                          zh: '訓練代表熟悉議事規則、研究方法與辯論技巧。' },
  'role.pr.en':         { en: 'Public Relations',         zh: '公關' },
  'role.pr.duty':       { en: 'Carries the club’s name outward: partners, schools and the public.',
                          zh: '對外聯繫合作單位、各校與公眾，經營社團形象。' },
  'role.web.en':        { en: 'Web & Systems',            zh: '網管' },
  'role.web.duty':      { en: 'Runs this site and the systems the club relies on.',
                          zh: '維護本網站及社團所需的各項系統。' },

  /* ── join / auth / profile ── */
  'join.title':      { en: 'Take a seat',      zh: '入座' },
  'join.sub':        { en: 'Sign in with Google so one person holds one seat.', zh: '請以 Google 登入，確保一人一席。' },
  'join.google':     { en: 'Continue with Google', zh: '使用 Google 繼續' },
  'join.verifying':  { en: 'Verifying…',       zh: '驗證中…' },
  'join.formTitle':  { en: 'Your details',     zh: '你的資料' },
  'join.formSub':    { en: 'This is what appears on your seat at the table.', zh: '這些資料會顯示在你的席位上。' },
  'join.name':       { en: 'Full Name',        zh: '姓名' },
  'join.namePh':     { en: 'Your full name',   zh: '請輸入姓名' },
  'join.grade':      { en: 'Grade',            zh: '年級' },
  'join.gradePh':    { en: 'Select grade',     zh: '請選擇年級' },
  'join.class':      { en: 'Class',            zh: '班級' },
  'join.classPh':    { en: 'Select class',     zh: '請選擇班級' },
  'join.submit':     { en: 'Take My Seat',     zh: '確認入座' },
  'join.saving':     { en: 'Seating you…',     zh: '安排席位中…' },
  'join.backTitle':  { en: 'Welcome back, {name}.', zh: '{name}，歡迎回來。' },
  'join.backSub':    { en: 'You are already seated at seat {n}.', zh: '你已就座於第 {n} 號席位。' },
  'login.title':     { en: 'Member Sign-In',   zh: '成員登入' },
  'login.sub':       { en: 'Sign in with Google to reach your profile.', zh: '請以 Google 登入以查看個人檔案。' },
  'admin.title':     { en: 'Administrator Access', zh: '管理員登入' },
  'admin.sub':       { en: 'Sign in with the administrator Google account.', zh: '請以管理員 Google 帳號登入。' },
  'admin.controls':  { en: 'Administrator Controls', zh: '管理員控制項' },
  'admin.flag':      { en: 'Admin',            zh: '管理員' },
  'admin.signOut':   { en: 'Sign out of administrator mode', zh: '退出管理員模式' },
  'admin.signIn':    { en: 'Administrator sign-in', zh: '管理員登入' },
  'admin.makeHead':  { en: 'Make Head of Council', zh: '設為理事會主席' },
  'admin.unmakeHead':{ en: 'Remove as Head of Council', zh: '取消理事會主席' },
  'admin.edit':      { en: 'Edit This Member', zh: '編輯此成員' },
  'admin.remove':    { en: 'Remove From Council', zh: '移出理事會' },
  'profile.title':   { en: 'Your profile',     zh: '個人檔案' },
  'profile.bio':     { en: 'A line about you', zh: '一句自我介紹' },
  'profile.bioPh':   { en: 'Optional',         zh: '選填' },
  'profile.save':    { en: 'Save',             zh: '儲存' },
  'profile.saving':  { en: 'Saving…',          zh: '儲存中…' },
  'profile.avatar':  { en: 'Portrait',         zh: '大頭貼' },

  /* ── ticker, detail, misc ── */
  'ticker.joined':   { en: '{name}, {grade} joined the council', zh: '{name}（{grade}）已加入理事會' },
  'detail.meta':     { en: 'Grade {grade} · Class {class}', zh: '{grade} 年級 · {class} 班' },
  'detail.avatar':   { en: 'Portrait: {name}', zh: '大頭貼：{name}' },
  'detail.edit':     { en: 'Edit portrait and line', zh: '編輯大頭貼與自介' },
  'avatar.none':     { en: 'No portrait chosen', zh: '尚未選擇大頭貼' },
  'avatar.custom':   { en: 'Uploaded portrait', zh: '自行上傳' },

  /* ── footer ── */
  'foot.name':       { en: 'Youhua Model United Nations', zh: '友華中學模擬聯合國' },
  'foot.est':        { en: 'Est. 2026',        zh: '創立於 2026 年' },
  'foot.tagline':    { en: 'A room where students argue for countries that are not their own.',
                       zh: '在這個議場裡，學生為並非自己的國家發言。' },
  'foot.contact':    { en: 'Contact',          zh: '聯絡方式' },
  'foot.rights':     { en: '© 2026 Youhua School Model United Nations.', zh: '© 2026 友華中學模擬聯合國' },
  'foot.credit':     { en: 'Hero image: UN General Assembly Hall by Patrick Gruban,', zh: '首頁圖片：聯合國大會廳，攝影 Patrick Gruban，' },
} satisfies Record<string, Entry>;

export type Key = keyof typeof DICT;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved === 'en' || saved === 'zh') return saved;
      /* No stored choice: follow the browser, so a zh-TW / zh-HK visitor
         lands in Chinese without having to find the toggle. */
      if (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '')) return 'zh';
    } catch { /* private mode: fall through to English */ }
    return 'en';
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORE_KEY, l); } catch { /* nothing to do */ }
  };

  useEffect(() => {
    /* The real language tag matters for screen readers, hyphenation and for
       the browser picking the right CJK glyph shapes. */
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.documentElement.dataset.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() { return useContext(Ctx); }

/* t('hero.welcome', { name: 'Amara', n: 3 }) */
export function useT() {
  const { lang } = useLang();
  return (key: Key, vars?: Record<string, string | number>) => {
    const entry = DICT[key] as Entry | undefined;
    let out = entry ? entry[lang] : String(key);
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
    return out;
  };
}
