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
  label: string;
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
