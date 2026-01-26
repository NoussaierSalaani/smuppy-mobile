/**
 * Validation utilities for form inputs, passwords, and data sanitization.
 * @module utils/validation
 */

// ============================================
// SANITIZATION
// ============================================

/**
 * Sanitize a string by removing potentially dangerous characters.
 * Removes: < > " ' `
 * @param {string} v - The string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitize = (v: string | undefined | null): string => v?.replace(/[<>"'`]/g, '').trim() || '';

/**
 * Sanitize all string values in an object.
 * @param {Object} obj - Object with string values to sanitize
 * @returns {Object} Object with sanitized string values
 */
export const sanitizeObject = <T extends Record<string, unknown>>(obj: T): T => {
  const clean: Record<string, unknown> = {};
  Object.keys(obj).forEach(k => { clean[k] = typeof obj[k] === 'string' ? sanitize(obj[k] as string) : obj[k]; });
  return clean as T;
};

// ============================================
// DISPOSABLE EMAIL DOMAINS (blocked)
// ============================================

/**
 * List of known disposable/temporary email domains.
 * These are blocked to ensure real email addresses.
 */
const DISPOSABLE_EMAIL_DOMAINS = [
  // Popular temp mail services
  'tempmail.com', 'temp-mail.org', 'tempmail.net', 'temp-mail.io', 'tempmail.de',
  'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net', 'guerrillamail.biz', 'guerrillamail.de',
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  '10minutemail.com', '10minutemail.net', '10minmail.com', '10minutemail.co.uk',
  'throwaway.email', 'throwamail.com', 'throwawaymail.com',
  'fakeinbox.com', 'fakemailgenerator.com', 'fakemail.net', 'fakemailgenerator.net',
  'trashmail.com', 'trashmail.net', 'trashmail.org', 'trashmail.me',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'yopmail.org',
  'dispostable.com', 'disposablemail.com', 'disposable.email',
  'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
  'getnada.com', 'nada.email', 'tempinbox.com',
  'mohmal.com', 'sharklasers.com', 'spam4.me',
  'grr.la', 'guerrillamailblock.com', 'pokemail.net',
  'spamgourmet.com', 'mytrashmail.com', 'mt2009.com',
  'thankyou2010.com', 'trash2009.com', 'mt2014.com',
  'mailsac.com', 'harakirimail.com', 'discard.email',
  'spamex.com', 'emailondeck.com', 'tempr.email',
  'dropmail.me', 'getairmail.com', 'meltmail.com',
  'mailnull.com', 'e4ward.com', 'incognitomail.org',
  'mailexpire.com', 'spamfree24.org', 'jetable.org',
  'mail-temporaire.fr', 'tmpmail.org', 'tmpmail.net',
  'mintemail.com', 'tempmailer.com', 'burnermail.io',
  'mailslite.com', 'inboxkitten.com', 'emailfake.com',
  '33mail.com', 'amilegit.com', 'anonymbox.com',
  // Additional domains
  'crazymailing.com', 'tempail.com', 'tmails.net',
  'emkei.cz', 'anonymmail.net', 'mailforspam.com',
  'spamherelots.com', 'spamobox.com', 'tempomail.fr',
  'mailtemp.net', 'emailtemporario.com.br', 'emailtmp.com',
  'fakemailgenerator.org', 'getonemail.com', 'hidemail.de',
  'hmamail.com', 'imgof.com', 'instantemailaddress.com',
  'maildu.de', 'mailforspam.com', 'mailfreeonline.com',
  'mailimate.com', 'mailme.lv', 'mailmetrash.com',
  'mailmoat.com', 'mailscrap.com', 'mailshell.com',
  'mailsiphon.com', 'mailtemp.info', 'mailzilla.com',
  'mbx.cc', 'meltmail.com', 'mierdamail.com',
  'mintemail.com', 'mjukgansen.nu', 'moakt.com',
  'mobi.web.id', 'mobileninja.co.uk', 'moburl.com',
  'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'monumentmail.com', 'ms9.mailslite.com', 'mswork.net',
  'mt2015.com', 'mt2016.com', 'mt2017.com',
  'mucinmail.com', 'mx0.wwwnew.eu', 'mycleaninbox.net',
  'mypartyclip.de', 'myphantomemail.com', 'myspadmail.com',
  'mytempemail.com', 'mytempmail.com', 'mytrashmail.com',
  'neomailbox.com', 'nepwk.com', 'nervmich.net',
  'nervtmansen.nu', 'netmails.com', 'netmails.net',
  'netzidiot.de', 'neverbox.com', 'nice-4u.com',
  'nincsmail.com', 'nincsmail.hu', 'nmail.cf',
  'nobulk.com', 'noclickemail.com', 'nogmailspam.info',
  'nomail.xl.cx', 'nomail2me.com', 'nomorespamemails.com',
  'nonspam.eu', 'nonspammer.de', 'noref.in',
  'nospam.ze.tc', 'nospam4.us', 'nospamfor.us',
  'nospammail.net', 'nospamthanks.info', 'notmailinator.com',
  'notsharingmy.info', 'nowhere.org', 'nowmymail.com',
  'nurfuerspam.de', 'nus.edu.sg', 'nwldx.com',
  'objectmail.com', 'obobbo.com', 'odnorazovoe.ru',
  'ohaaa.de', 'omail.pro', 'oneoffemail.com',
  'onewaymail.com', 'onlatedotcom.info', 'online.ms',
  'oopi.org', 'opayq.com', 'ordinaryamerican.net',
  'otherinbox.com', 'ourklips.com', 'outlawspam.com',
  'ovpn.to', 'owlpic.com', 'pancakemail.com',
  'pjjkp.com', 'plexolan.de', 'poczta.onet.pl',
  'politikerclub.de', 'poofy.org', 'pookmail.com',
  'privacy.net', 'privatdemail.net', 'privy-mail.com',
  'privymail.de', 'proxymail.eu', 'prtnx.com',
  'punkass.com', 'putthisinyourspamdatabase.com',
  'pwrby.com', 'qisdo.com', 'qisoa.com',
  'quickinbox.com', 'quickmail.nl', 'radiku.ye.vc',
  'rcpt.at', 're-gister.com', 'reallymymail.com',
  'realtyalerts.ca', 'recode.me', 'recursor.net',
  'recyclemail.dk', 'regbypass.com', 'regbypass.comsafe-mail.net',
  'rejectmail.com', 'remail.cf', 'remail.ga',
  'rhyta.com', 'rklips.com', 'rmqkr.net',
  'royal.net', 'rppkn.com', 'rtrtr.com',
  's0ny.net', 'safe-mail.net', 'safersignup.de',
  'safetymail.info', 'safetypost.de', 'sandelf.de',
  'saynotospams.com', 'schafmail.de', 'schrott-email.de',
  'secretemail.de', 'secure-mail.biz', 'selfdestructingmail.com',
  'sendspamhere.com', 'senseless-entertainment.com',
  'server.ms.selfip.com', 'sharedmailbox.org', 'sharklasers.com',
  'shieldedmail.com', 'shieldemail.com', 'shiftmail.com',
  'shitmail.me', 'shitmail.org', 'shortmail.net',
  'shut.name', 'shut.ws', 'sibmail.com',
  'sinnlos-mail.de', 'siteposter.net', 'skeefmail.com',
  'slaskpost.se', 'slopsbox.com', 'slowslow.de',
  'smashmail.de', 'smellfear.com', 'snakemail.com',
  'sneakemail.com', 'sneakmail.de', 'snkmail.com',
  'sofimail.com', 'sofort-mail.de', 'softpls.asia',
  'sogetthis.com', 'sohu.com', 'soisz.com',
  'solvemail.info', 'soodomail.com', 'soodonims.com',
  'spam.la', 'spam.su', 'spam4.me',
  'spamail.de', 'spamarrest.com', 'spamavert.com',
  'spambob.com', 'spambob.net', 'spambob.org',
  'spambog.com', 'spambog.de', 'spambog.ru',
  'spambox.info', 'spambox.irishspringrealty.com',
  'spambox.us', 'spamcannon.com', 'spamcannon.net',
  'spamcero.com', 'spamcon.org', 'spamcorptastic.com',
  'spamcowboy.com', 'spamcowboy.net', 'spamcowboy.org',
  'spamday.com', 'spameater.com', 'spameater.org',
  'spamex.com', 'spamfree.eu', 'spamfree24.com',
  'spamfree24.de', 'spamfree24.eu', 'spamfree24.info',
  'spamfree24.net', 'spamfree24.org', 'spamgoes.in',
  'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'spamherelots.com', 'spamhereplease.com', 'spamhole.com',
  'spamify.com', 'spaminator.de', 'spamkill.info',
  'spaml.com', 'spaml.de', 'spamlot.net',
  'spammotel.com', 'spamobox.com', 'spamoff.de',
  'spamsalad.in', 'spamslicer.com', 'spamspot.com',
  'spamstack.net', 'spamthis.co.uk', 'spamthisplease.com',
  'spamtrail.com', 'spamtroll.net', 'speed.1s.fr',
  'spoofmail.de', 'squizzy.de', 'ssoia.com',
  'startkeys.com', 'stinkefinger.net', 'stop-my-spam.cf',
  'stuffmail.de', 'supergreatmail.com', 'supermailer.jp',
  'superrito.com', 'superstachel.de', 'suremail.info',
  'svk.jp', 'sweetxxx.de', 'tafmail.com',
  'taglead.com', 'tagmymedia.com', 'tagyourself.com',
  'talkinator.com', 'tapchicuoihoi.com', 'techemail.com',
  'techgroup.me', 'teewars.org', 'teleosaurs.xyz',
  'tellos.xyz', 'temp-mail.de', 'temp-mail.ru',
  'temp.bartdevos.be', 'temp.headstrong.de', 'tempail.com',
  'tempalias.com', 'tempe-mail.com', 'tempemail.biz',
  'tempemail.co.za', 'tempemail.com', 'tempemail.net',
  'tempinbox.co.uk', 'tempinbox.com', 'tempmail.co',
  'tempmail.de', 'tempmail.eu', 'tempmail.it',
  'tempmail2.com', 'tempmaildemo.com', 'tempmailer.com',
  'tempmailer.de', 'tempomail.fr', 'temporarily.de',
  'temporarioemail.com.br', 'temporaryemail.net', 'temporaryemail.us',
  'temporaryforwarding.com', 'temporaryinbox.com', 'temporarymailaddress.com',
  'tempsky.com', 'tempthe.net', 'tempymail.com',
  'thanksnospam.info', 'thankyou2010.com', 'thecloudindex.com',
  'thisisnotmyrealemail.com', 'throam.com', 'throwam.com',
  'throwawayemailaddress.com', 'tilien.com', 'tittbit.in',
  'tmailinator.com', 'toiea.com', 'toomail.biz',
  'topranklist.de', 'tradermail.info', 'trash-amil.com',
  'trash-mail.at', 'trash-mail.com', 'trash-mail.de',
  'trash2009.com', 'trash2010.com', 'trash2011.com',
  'trashbox.eu', 'trashdevil.com', 'trashdevil.de',
  'trashemail.de', 'trashmail.at', 'trashmail.com',
  'trashmail.de', 'trashmail.me', 'trashmail.net',
  'trashmail.org', 'trashmail.ws', 'trashmailer.com',
  'trashymail.com', 'trashymail.net', 'trbvm.com',
  'trickmail.net', 'trillianpro.com', 'tryalert.com',
  'turual.com', 'twinmail.de', 'twoweirdtricks.com',
  'tyldd.com', 'uggsrock.com', 'umail.net',
  'upliftnow.com', 'uplipht.com', 'uroid.com',
  'us.af', 'valemail.net', 'venompen.com',
  'veryrealemail.com', 'viditag.com', 'viewcastmedia.com',
  'viewcastmedia.net', 'viewcastmedia.org', 'viralplays.com',
  'vkcode.ru', 'vpn.st', 'vsimcard.com',
  'vubby.com', 'wasteland.rfc822.org', 'watch-harry-potter.com',
  'watchfull.net', 'webemail.me', 'webm4il.info',
  'webuser.in', 'wee.my', 'weg-werf-email.de',
  'wegwerf-email-addressen.de', 'wegwerf-emails.de', 'wegwerfadresse.de',
  'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfmail.de',
  'wegwerfmail.info', 'wegwerfmail.net', 'wegwerfmail.org',
  'wetrainbayarea.com', 'wetrainbayarea.org', 'wh4f.org',
  'whatiaas.com', 'whatpaas.com', 'whopy.com',
  'whtjddn.33mail.com', 'whyspam.me', 'wilemail.com',
  'willhackforfood.biz', 'willselfdestruct.com', 'winemaven.info',
  'wolfsmail.tk', 'wollan.info', 'worldspace.link',
  'wronghead.com', 'wuzup.net', 'wuzupmail.net',
  'wwwnew.eu', 'xagloo.co', 'xagloo.com',
  'xemaps.com', 'xents.com', 'xmaily.com',
  'xoxy.net', 'yapped.net', 'yeah.net',
  'yep.it', 'yogamaven.com', 'yomail.info',
  'yopmail.com', 'yopmail.fr', 'yopmail.gq',
  'yopmail.net', 'yourdomain.com', 'ypmail.webarnak.fr.eu.org',
  'yuurok.com', 'z1p.biz', 'za.com',
  'zehnminuten.de', 'zehnminutenmail.de', 'zetmail.com',
  'zippymail.info', 'zoaxe.com', 'zoemail.com',
  'zoemail.net', 'zoemail.org', 'zomg.info',
  'zxcv.com', 'zxcvbnm.com', 'zzz.com',
];

/**
 * Check if an email domain is a known disposable/temporary email service.
 * @param {string} email - Email to check
 * @returns {boolean} True if disposable (should be blocked)
 */
export const isDisposableEmail = (email: string | undefined | null): boolean => {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
};

// ============================================
// DOMAIN TYPO DETECTION
// ============================================

/**
 * Map of legitimate popular email domains.
 * Used to detect typos in common email providers.
 */
const LEGITIMATE_DOMAINS = {
  // Gmail
  'gmail.com': true,
  // Outlook/Hotmail/Microsoft
  'outlook.com': true, 'outlook.fr': true, 'outlook.de': true,
  'hotmail.com': true, 'hotmail.fr': true, 'hotmail.co.uk': true,
  'live.com': true, 'live.fr': true,
  'msn.com': true,
  // Yahoo
  'yahoo.com': true, 'yahoo.fr': true, 'yahoo.co.uk': true, 'yahoo.de': true,
  'ymail.com': true,
  // Apple
  'icloud.com': true, 'me.com': true, 'mac.com': true,
  // ProtonMail
  'protonmail.com': true, 'proton.me': true, 'pm.me': true,
  // French providers
  'orange.fr': true, 'wanadoo.fr': true,
  'sfr.fr': true, 'neuf.fr': true,
  'free.fr': true,
  'laposte.net': true,
  'bbox.fr': true, 'bouygtel.fr': true,
  // Other popular
  'aol.com': true,
  'zoho.com': true,
  'gmx.com': true, 'gmx.fr': true, 'gmx.de': true,
  'mail.com': true,
  'fastmail.com': true,
  'tutanota.com': true, 'tuta.io': true,
};

/**
 * Common typo patterns for popular email domains.
 * Maps typo -> correct domain
 */
const DOMAIN_TYPOS = {
  // Gmail typos
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cpm': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.xom': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.coim': 'gmail.com',
  'gmail.coom': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmaiil.com': 'gmail.com',
  'g]mail.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'ggmail.com': 'gmail.com',
  'hmail.com': 'gmail.com',
  'mail.com': null, // This is legitimate, don't suggest
  // Hotmail typos
  'hotmail.co': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hitmail.com': 'hotmail.com',
  'hoymail.com': 'hotmail.com',
  'hatmail.com': 'hotmail.com',
  // Outlook typos
  'outlook.co': 'outlook.com',
  'outlook.cm': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outloook.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outllook.com': 'outlook.com',
  'outlookk.com': 'outlook.com',
  'putlook.com': 'outlook.com',
  // Yahoo typos
  'yahoo.co': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'tahoo.com': 'yahoo.com',
  // iCloud typos
  'icloud.co': 'icloud.com',
  'icloud.cm': 'icloud.com',
  'icloud.con': 'icloud.com',
  'iclould.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  'icluod.com': 'icloud.com',
  // Orange typos (French)
  'orange.com': 'orange.fr',
  'oange.fr': 'orange.fr',
  'ornage.fr': 'orange.fr',
  // Common TLD typos
  '.con': '.com',
  '.cim': '.com',
  '.ocm': '.com',
  '.comm': '.com',
};

interface DomainTypoResult {
  isTypo: boolean;
  suggestion?: string;
}

/**
 * Check if an email domain appears to be a typo of a popular domain.
 * @param {string} email - Email to check
 * @returns {{isTypo: boolean, suggestion?: string}} Result with optional correction
 */
export const detectDomainTypo = (email: string | undefined | null): DomainTypoResult => {
  if (!email) return { isTypo: false };

  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return { isTypo: false };

  // Direct typo match
  const typoMatch = (DOMAIN_TYPOS as Record<string, string | null>)[domain];
  if (typoMatch) {
    return { isTypo: true, suggestion: typoMatch };
  }

  // Check for common TLD typos on any domain
  for (const [typoTld, correctTld] of Object.entries(DOMAIN_TYPOS)) {
    if (typoTld.startsWith('.') && correctTld && domain.endsWith(typoTld.slice(1))) {
      const baseDomain = domain.slice(0, -typoTld.length + 1);
      const correctedDomain = baseDomain + correctTld.slice(1);
      // Only suggest if the corrected domain is legitimate
      if ((LEGITIMATE_DOMAINS as Record<string, boolean>)[correctedDomain]) {
        return { isTypo: true, suggestion: correctedDomain };
      }
    }
  }

  return { isTypo: false };
};

/**
 * Check if domain is a known legitimate email provider.
 * @param {string} email - Email to check
 * @returns {boolean} True if legitimate provider
 */
export const isLegitimateProvider = (email: string | undefined | null): boolean => {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  return !!(LEGITIMATE_DOMAINS as Record<string, boolean>)[domain];
};

// ============================================
// GENERAL VALIDATORS
// ============================================

/**
 * Collection of validation functions for common input types.
 * Each function returns true if valid, false otherwise.
 * @example
 * validate.email('user@example.com') // true
 * validate.username('john_doe') // true
 */
export const validate = {
  /**
   * Validate email format with stricter rules:
   * - Local part: 1+ chars (letters, numbers, ._+-)
   * - Domain: 2+ chars
   * - TLD: 2-10 letters (com, org, fr, co.uk, etc.)
   * - Not a disposable email domain
   * - Not a typo of a popular domain
   */
  email: (v: string | undefined | null): boolean => {
    const trimmed = v?.trim();
    if (!trimmed) return false;
    const formatValid = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/.test(trimmed);
    if (!formatValid) return false;
    if (isDisposableEmail(trimmed)) return false;
    // Check for typos in popular domains
    const typoCheck = detectDomainTypo(trimmed);
    if (typoCheck.isTypo) return false;
    return true;
  },
  /** Validate phone number (10+ digits with optional formatting) */
  phone: (v: string | undefined | null): boolean => /^[\d\s\-+()]{10,}$/.test(v?.trim() || ''),
  /** Validate username (3-20 chars, alphanumeric + underscore) */
  username: (v: string | undefined | null): boolean => /^[a-zA-Z0-9_]{3,20}$/.test(v || ''),
  /** Check if value is not empty after trimming */
  notEmpty: (v: string | undefined | null): boolean => (v?.trim()?.length ?? 0) > 0,
  /** Check minimum length */
  minLength: (v: string | undefined | null, min: number): boolean => (v?.length ?? 0) >= min,
  /** Check maximum length */
  maxLength: (v: string | undefined | null, max: number): boolean => (v?.length ?? 0) <= max,
  /** Check if two values match */
  match: (v1: unknown, v2: unknown): boolean => v1 === v2,
  /** Validate URL format */
  url: (v: string | undefined | null): boolean => /^https?:\/\/.+\..+/.test(v?.trim() || ''),
  /** Check if value contains only digits */
  numeric: (v: string | undefined | null): boolean => /^\d+$/.test(v || ''),
  /** Check if value is alphanumeric */
  alphanumeric: (v: string | undefined | null): boolean => /^[a-zA-Z0-9]+$/.test(v || ''),
};

// ============================================
// PASSWORD VALIDATION
// ============================================

interface PasswordRule {
  id: string;
  label: string;
  test: (pwd: string | undefined | null) => boolean;
}

interface PasswordRuleResult {
  id: string;
  label: string;
  passed: boolean;
}

interface PasswordStrengthLevel {
  level: 'weak' | 'medium' | 'strong' | 'very-strong';
  label: string;
  color: string;
}

/**
 * Password validation rules for security requirements.
 * Each rule has an id, label, and test function.
 */
export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (pwd) => (pwd?.length ?? 0) >= 8 },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)', test: (pwd) => /[A-Z]/.test(pwd || '') },
  { id: 'lowercase', label: 'One lowercase letter (a-z)', test: (pwd) => /[a-z]/.test(pwd || '') },
  { id: 'number', label: 'One number (0-9)', test: (pwd) => /[0-9]/.test(pwd || '') },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (pwd) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd || '') },
];

/**
 * Validate password against all rules and return detailed results.
 * @param {string} password - Password to validate
 * @returns {Array<{id: string, label: string, passed: boolean}>} Array of rule results
 */
export const validatePassword = (password: string | undefined | null): PasswordRuleResult[] => {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(password),
  }));
};

/**
 * Check if password meets all security requirements.
 * @param {string} password - Password to validate
 * @returns {boolean} True if all rules pass
 */
export const isPasswordValid = (password: string | undefined | null): boolean => {
  return PASSWORD_RULES.every((rule) => rule.test(password));
};

/**
 * Calculate password strength score (0-100).
 * Considers: rule compliance, length bonus, character variety.
 * @param {string} password - Password to evaluate
 * @returns {number} Strength score 0-100
 */
export const getPasswordStrength = (password: string | undefined | null): number => {
  if (!password) return 0;
  const passedRules = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const baseScore = (passedRules / PASSWORD_RULES.length) * 70;
  const lengthBonus = Math.min((password.length - 8) * 2, 20);
  const uniqueChars = new Set(password).size;
  const varietyBonus = Math.min((uniqueChars / password.length) * 10, 10);
  return Math.min(Math.round(baseScore + Math.max(0, lengthBonus) + varietyBonus), 100);
};

/**
 * Get password strength level with label and color for UI display.
 * @param {string} password - Password to evaluate
 * @returns {{level: string, label: string, color: string}} Strength info
 * @example
 * getPasswordStrengthLevel('Abc123!@') // { level: 'strong', label: 'Strong', color: '#34C759' }
 */
export const getPasswordStrengthLevel = (password: string | undefined | null): PasswordStrengthLevel => {
  const strength = getPasswordStrength(password);
  if (strength < 30) return { level: 'weak', label: 'Weak', color: '#FF3B30' };
  if (strength < 50) return { level: 'medium', label: 'Medium', color: '#FF9500' };
  if (strength < 80) return { level: 'strong', label: 'Strong', color: '#34C759' };
  return { level: 'very-strong', label: 'Very Strong', color: '#11E3A3' };
};

// ============================================
// FORM VALIDATION HELPER
// ============================================

type ValidationRule = (value: unknown) => string | null;

interface FieldConfig {
  value: unknown;
  rules: ValidationRule[];
}

interface FormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate multiple form fields at once.
 * @param {Object} fields - Object with field configs { fieldName: { value, rules: [fn, fn] } }
 * @returns {{isValid: boolean, errors: Object}} Validation result
 * @example
 * const result = validateForm({
 *   email: { value: 'test@email.com', rules: [rules.required, rules.email] },
 *   password: { value: 'abc', rules: [rules.required, rules.password] }
 * });
 * // result.isValid = false, result.errors = { password: 'Password does not meet requirements' }
 */
export const validateForm = (fields: Record<string, FieldConfig>): FormValidationResult => {
  const errors: Record<string, string> = {};
  Object.keys(fields).forEach(key => {
    const { value, rules } = fields[key];
    for (const rule of rules) {
      const error = rule(value);
      if (error) { errors[key] = error; break; }
    }
  });
  return { isValid: Object.keys(errors).length === 0, errors };
};

// ============================================
// PRE-BUILT RULES FOR validateForm
// ============================================

/**
 * Pre-built validation rules that return error messages.
 * Use with validateForm() function.
 * @example
 * const emailRules = [rules.required, rules.email];
 * const passwordRules = [rules.required, rules.password];
 */
export const rules = {
  required: (v: unknown): string | null => !validate.notEmpty(v as string) ? 'This field is required' : null,
  email: (v: unknown): string | null => !validate.email(v as string) ? 'Invalid email address' : null,
  phone: (v: unknown): string | null => !validate.phone(v as string) ? 'Invalid phone number' : null,
  username: (v: unknown): string | null => !validate.username(v as string) ? 'Username must be 3-20 characters (letters, numbers, _)' : null,
  password: (v: unknown): string | null => !isPasswordValid(v as string) ? 'Password does not meet requirements' : null,
  minLength: (min: number) => (v: unknown): string | null => !validate.minLength(v as string, min) ? `Minimum ${min} characters` : null,
  maxLength: (max: number) => (v: unknown): string | null => !validate.maxLength(v as string, max) ? `Maximum ${max} characters` : null,
  match: (compareValue: unknown, fieldName: string) => (v: unknown): string | null => !validate.match(v, compareValue) ? `Must match ${fieldName}` : null,
};