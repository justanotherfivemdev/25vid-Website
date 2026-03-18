// Default site content — fallback values when no database content exists yet.
// All values here can be overridden live via Admin > Command Center.

import { BACKEND_URL } from '@/utils/api';

export const defaultSiteContent = {
  browser: {
    tabTitle: '25th Infantry Division',
    tabIcon: '',
    tabDescription: 'Official site of the 25th Infantry Division — Tropic Lightning. Ready to Strike, Anywhere, Anytime.'
  },
  hero: {
    backgroundImage: '',
    tagline: 'TROPIC LIGHTNING',
    subtitle: 'Ready to Strike — Anywhere, Anytime',
  },
  nav: {
    title: '25TH INFANTRY DIVISION',
    brandName: '25TH INFANTRY DIVISION',
    buttonText: 'ENLIST NOW',
    hubLabel: 'MEMBER HUB'
  },
  about: {
    sectionTitle: 'ABOUT THE 25TH',
    sectionSubtitle: 'History, Honor, and the Taro Leaf',
    logoImage: `${BACKEND_URL}/api/uploads/25th_id_patch.png`,
    paragraph1: 'The 25th Infantry Division — known as "Tropic Lightning" — is one of the most storied divisions in U.S. military history. Activated on October 1, 1941, at Schofield Barracks, Hawaii, the division earned its nickname from its distinctive taro leaf shoulder patch and the lightning bolt that symbolizes the speed and power of its operations.',
    paragraph2: 'From the jungles of Guadalcanal and the Philippines in World War II, through the frozen terrain of Korea, the dense forests of Vietnam, and the mountains of Afghanistan, the 25th has served with distinction in every major American conflict. Now in Arma Reforger, the 25th Infantry Division carries that same legacy forward — a tight-knit unit of dedicated operators committed to tactical excellence, realistic combined arms operations, and the brotherhood that defines the Tropic Lightning spirit.',
    quote: {
      text: '"Ready to Strike — Anywhere, Anytime"',
      author: '25th Infantry Division Motto',
      backgroundImage: ''
    },
    missionTitle: 'OUR MISSION',
    missionText: 'To maintain a combat-ready force capable of rapid deployment and sustained operations, embodying the Tropic Lightning tradition of speed, discipline, and lethal proficiency in every engagement.'
  },
  sectionHeadings: {
    about: {
      heading: 'ABOUT',
      subtext: ''
    },
    history: {
      heading: 'UNIT HISTORY',
      subtext: 'Over 80 years of service, sacrifice, and the Tropic Lightning legacy'
    },
    operationalSuperiority: {
      heading: 'OPERATIONAL SUPERIORITY',
      subtext: ''
    },
    lethality: {
      heading: 'LETHALITY ON DEMAND',
      subtext: ''
    },
    operations: {
      heading: 'UPCOMING OPERATIONS',
      subtext: 'Join the next tactical mission'
    },
    intel: {
      heading: 'LATEST INTEL',
      subtext: 'Stay informed with our latest updates'
    },
    gallery: {
      heading: 'MISSION GALLERY',
      subtext: 'Tropic Lightning in Action'
    },
    enlist: {
      heading: 'JOIN THE 25TH',
      subtext: 'Become part of the Tropic Lightning legacy'
    }
  },
  operations: {
    sectionTitle: 'OPERATIONAL SUPERIORITY',
    sectionSubtitle: 'Combined Arms. Rapid Deployment. Decisive Action.'
  },
  training: {
    sectionTitle: 'TRAINING & READINESS',
    sectionSubtitle: 'Forged in Discipline',
    imageUrl: '',
    description: 'Our training pipeline builds combat-effective soldiers through progressive skill development — from basic infantry tactics to advanced combined arms operations, ensuring every member of the 25th is mission-ready.'
  },
  logistics: {
    sectionTitle: 'LOGISTICS & SUPPORT',
    imageUrl: '',
    description: 'The backbone of sustained operations. Our logistics section ensures equipment readiness, supply chain coordination, and operational support across all theaters of deployment.'
  },
  gallery: {
    sectionTitle: 'UNIT GALLERY',
    sectionSubtitle: 'Tropic Lightning in Action',
    showcaseImages: []
  },
  operationalSuperiority: {
    description: 'The 25th Infantry Division maintains operational superiority through combined arms mastery, rapid deployment capability, and relentless combat readiness. From jungle warfare to urban operations, Tropic Lightning soldiers train to dominate across the full spectrum of conflict.',
    images: []
  },
  lethality: {
    logistics: {
      heading: 'LOGISTICS & OPERATIONAL SUPPORT',
      description: 'Sustained operations demand robust logistical support. The 25th maintains a complete supply chain, vehicle maintenance, and medical support infrastructure — ensuring every element stays mission-capable in any theater.',
      image: ''
    },
    training: {
      heading: 'TRAINING PROGRAMS',
      description: 'Our training pipeline is built on progressive skill development. From basic infantry tactics to advanced combined arms integration, every soldier in the 25th earns their place through demonstrated proficiency and unwavering discipline.',
      image: ''
    }
  },
  join: {
    sectionTitle: 'JOIN THE 25TH',
    sectionSubtitle: 'Become Part of the Tropic Lightning Legacy'
  },
  login: {
    showBackground: true,
    overlayOpacity: 0.85
  },
  partnerLogin: {
    backgroundImage: '',
    showBackground: true,
    overlayOpacity: 0.85
  },
  footer: {
    unitName: '25th Infantry Division — Tropic Lightning',
    tagline: 'Ready to Strike',
    email: 'delta@25thvid.com',
    discord: 'https://discord.gg/3CJH2ZspsU',
    disclaimer: 'This is a fictional Arma Reforger milsim unit. We are NOT in any way tied to the Department of War or the United States Department of Defense.'
  }
};
