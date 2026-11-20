import type { DeepPartial, Messages } from './es';

/**
 * Quechua (variante boliviana) y aimara: traducciones BETA de los textos principales.
 * Deben validarse con hablantes antes de producción. Lo que falta cae al español.
 */
export const qu: DeepPartial<Messages> = {
  nav: {
    home: 'Qallariy',
    space: 'Ñuqap kitiy',
    explore: "T'aqwiy",
    notifications: 'Willaykuna',
    profile: 'Cuentayki',
    signIn: 'Yaykuy',
    signOut: 'Lluqsiy',
    language: 'Simi',
    beta: 'beta',
  },
  common: { continue: 'Qatiy', back: 'Kutiy', cancel: 'Saqiy', save: 'Waqaychay', close: "Wisq'ay", retry: 'Watiqmanta' },
  home: {
    eyebrow: 'Negociokunapaq imakuna',
    skip: 'Ñuqap kitiyman riy',
    panels: [
      {
        title: 'Tukuy imapas huk yuyaywan qallarin',
        body: 'Willariwayku ima negociotachus qallariyta utaq wiñachiyta munanki.',
        cta: 'Negocioyta hatarichiy',
      },
      { title: 'Musquyniykiman rikchayta quy', body: 'Negocioykiqa huk wasiman tukun, kikin imakunantin.', cta: 'Qallariy utaq wiñachiy' },
      {
        title: 'Ima munasqaykita tariy',
        body: 'Jucumariqa yuyayniykita imakunaman t’aqan: maquinakuna, tiyanakuna, llamk’anakuna.',
        cta: "Imakunata t'aqwiy",
      },
      {
        title: 'Tukuy suyukunamanta rantiy',
        body: 'Kaypi utaq karupi qukuqkunata tupachiy: chaninta, p’unchawninta, iñiyninta.',
        cta: "Qukuqkunata t'aqwiy",
      },
      {
        title: 'Iñiywan rantiy',
        body: 'Qullqiqa waqaychasqa kachkan rimanakusqaman hina. Sasachakuy kaqtinqa, willakuyta kichariy.',
        cta: 'Waqaychayta qhaway',
      },
      { title: 'Mana saywayuq hatarichiy', body: 'Mayk’ap kutimuwaq: iskay kaq wasi, musuq maquinakuna.', cta: 'Kunan qallariy' },
    ],
  },
  space: {
    title: '¿Imatataq negocioykipaq munanki?',
    intro: 'Allinta qillqay ima negocioykipaq munasqaykita. Sapa p’unchaw 10 maskaykunayuq kanki.',
    quota: 'Kunan p’unchaw {{limit}} maskaymanta {{remaining}} kanraq',
    housesTitle: 'Negocioykikuna',
    newHouse: 'Musuq negocio',
  },
  auth: { title: 'Yaykuy' },
};

export const ay: DeepPartial<Messages> = {
  nav: {
    home: 'Qalltawi',
    space: 'Nayan chiqaxa',
    explore: 'Thaqhaña',
    notifications: 'Yatiyawinaka',
    profile: 'Cuentama',
    signIn: 'Mantaña',
    signOut: 'Mistuña',
    language: 'Aru',
    beta: 'beta',
  },
  common: { continue: 'Sarantaña', back: "Kutt'aña", cancel: 'Jaytaña', save: 'Imaña', close: 'Jist’antaña', retry: 'Mayampi' },
  home: {
    eyebrow: 'Negocionakatakix yänaka',
    skip: 'Nayan chiqaxar saraña',
    panels: [
      {
        title: 'Taqi kunas mä amuyumpi qalltaraki',
        body: 'Kuna negociosa qalltañ jan ukax jilxattayañ muntaxa uk yatiyita.',
        cta: 'Negociojar luraña',
      },
      {
        title: 'Amtamarux uñnaqa churam',
        body: 'Negocioman mä utaruw tukuraki, pachpa yänakapampi.',
        cta: 'Qalltaña jan ukax jilxattayaña',
      },
      {
        title: 'Kunatï wakisktam ukx jikxatam',
        body: 'Jucumarix amuyumarux yänakaruw jaljti: maquinanaka, qunuñanaka, irnaqañanaka.',
        cta: 'Yänak thaqhaña',
      },
      {
        title: 'Taqi markanakat alxam',
        body: 'Akankir jan ukax jaya markankir alxirinak chikancham: chanipa, urunakapa.',
        cta: 'Alxirinak thaqhaña',
      },
      {
        title: 'Iyawsäwimpi alam',
        body: 'Qullqix arsutarjamaw imatäski. Jan walt’äwi utjchixa, mä ch’axwa jist’arañamawa.',
        cta: 'Imaña uñjaña',
      },
      { title: 'Jan qurpanaka utt’ayam', body: 'Kunapachas kutt’anismawa: mayni uta, machaq maquinanaka.', cta: 'Jichhapach qalltaña' },
    ],
  },
  space: {
    title: '¿Kunas negocioman wakisi?',
    intro: 'Kunatï negocioman wakiski uk sum qillqt’am. Sapa urux 10 thaqhäwinakaw utji.',
    quota: 'Jichhürux {{limit}} thaqhäwinakat {{remaining}} utjaskiwa',
    housesTitle: 'Negocionakama',
    newHouse: 'Machaq negocio',
  },
  auth: { title: 'Mantaña' },
};
