import institutions from "./institutions.json";

export interface CampusInstitution {
  id: string;
  name: string;
  slug: string;
  campuses: string[];
  faculties: string[];
}

export const CAMPUS_INSTITUTIONS: CampusInstitution[] = institutions;
export const institutionsById = Object.fromEntries(
  CAMPUS_INSTITUTIONS.map((institution) => [institution.id, institution]),
) as Record<string, CampusInstitution>;

const normalizeLookup = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const aliasesById: Record<string, string[]> = {
  "lagos-state-university": ["LASU", "Lagos State University (LASU)"],
  "lagos-state-university-of-education": ["LASUED", "Lagos State University of Education (LASUED)"],
  "lagos-state-university-of-science-and-technology": ["LASUSTECH"],
  "university-of-lagos": ["UNILAG", "University of Lagos (UNILAG)"],
  "university-of-ibadan": ["UI"],
  "obafemi-awolowo-university": ["OAU"],
  "university-of-ilorin": ["UNILORIN"],
  "university-of-benin": ["UNIBEN"],
  "university-of-jos": ["UNIJOS"],
  "ambrose-alli-university": ["AAU"],
  "olabisi-onabanjo-university": ["OOU"],
  "university-of-nigeria-nsukka": ["UNN"],
  "ahmadu-bello-university": ["ABU"],
  "covenant-university": ["CU"],
  "yaba-college-of-technology": ["YABATECH"],
  "ogun-state-institute-of-technology": ["OGITECH"],
  "federal-polytechnic-ilaro": ["Federal Poly Ilaro"],
  "auchi-polytechnic": ["Auchi Poly"],
  "moshood-abiola-polytechnic": ["MAPOLY"],
  "kaduna-polytechnic": ["KADPOLY"],
};

const institutionsByAlias = new Map<string, CampusInstitution>();
for (const institution of CAMPUS_INSTITUTIONS) {
  institutionsByAlias.set(normalizeLookup(institution.name), institution);
  institutionsByAlias.set(normalizeLookup(institution.id), institution);
  for (const alias of aliasesById[institution.id] ?? []) {
    institutionsByAlias.set(normalizeLookup(alias), institution);
  }
}

export function getInstitutionById(id: string): CampusInstitution | undefined {
  return institutionsById[id];
}

export function getInstitutionByName(name: string): CampusInstitution | undefined {
  return institutionsByAlias.get(normalizeLookup(name));
}

export function getInstitutionId(nameOrAlias: string): string | undefined {
  return getInstitutionByName(nameOrAlias)?.id;
}