/** Everything the extension knows about you. Edit it in the options page. */
export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  currentTitle: string;
  currentCompany: string;
  yearsExperience: string;
  salaryExpectation: string;
  noticePeriod: string;
  englishLevel: string;
  summary: string;
}

/** Keys we can fill. `fullName` is derived from first + last name. */
export type FieldKey = keyof Profile | 'fullName';

/** A reusable answer to an open question ("Why do you want to work here?"). */
export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  updatedAt: string;
}

export type ApplicationStatus = 'applied' | 'interview' | 'offer' | 'rejected' | 'ghosted';

export interface Application {
  id: string;
  company: string;
  role: string;
  url: string;
  appliedAt: string;
  status: ApplicationStatus;
  notes: string;
  /** Where else this application was saved, e.g. { clickup: { id, url } }. */
  external?: Record<string, { id: string; url: string }>;
}

/** Plain description of a form field, so matching can be tested without a browser. */
export interface FieldDescriptor {
  tag: 'input' | 'textarea' | 'select';
  type: string;
  name: string;
  id: string;
  placeholder: string;
  autocomplete: string;
  ariaLabel: string;
  /** Explicit label: <label for>, wrapping <label>, aria-labelledby. */
  label: string;
  /** Text before the field. Easy to fake, so it is used last. */
  nearbyText?: string;
}

/** One field the extension proposes to fill. The popup shows these before filling. */
export interface PlanItem {
  ref: number;
  label: string;
  /** Profile key ("email") or, for answers, the saved question. */
  source: string;
  kind: 'profile' | 'answer';
  /** Profile fields are selected by default; saved answers must be ticked by you. */
  selected: boolean;
}

export interface FillPlan {
  items: PlanItem[];
  /** Fields that already had text. */
  skipped: number;
  /** Hidden fields that asked for your data and were ignored. */
  hidden: number;
}

export interface FillReport {
  filled: number;
  answered: number;
  skipped: number;
  fields: { label: string; source: string }[];
}

export const EMPTY_PROFILE: Profile = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  country: '',
  linkedin: '',
  github: '',
  portfolio: '',
  currentTitle: '',
  currentCompany: '',
  yearsExperience: '',
  salaryExpectation: '',
  noticePeriod: '',
  englishLevel: '',
  summary: '',
};
