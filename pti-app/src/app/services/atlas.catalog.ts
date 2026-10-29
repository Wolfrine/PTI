import { AtlasSector, AtlasSubject } from './atlas.models';

// A deliberately bounded editorial seed, not a universal taxonomy or a measure
// of all human knowledge. Only public reference material belongs in this file.
export const ATLAS_CATALOG_VERSION = '2026-10-29.1';
export const ATLAS_SOURCE_CHECKED_AT = '2026-10-29';
const refs = {
  web: { label: 'MDN · Web development curriculum', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development' },
  data: { label: 'Firebase · Offline data and synchronization', url: 'https://firebase.google.com/docs/firestore/manage-data/enable-offline' },
  agents: { label: 'MCP · Architecture and context exchange', url: 'https://modelcontextprotocol.io/docs/learn/architecture' },
  access: { label: 'W3C · Accessibility principles', url: 'https://www.w3.org/WAI/fundamentals/accessibility-principles/' },
  robotics: { label: 'MIT OCW · Introduction to Robotics', url: 'https://ocw.mit.edu/courses/2-12-introduction-to-robotics-fall-2005/' },
  materials: { label: 'MIT Open Learning · Solid State Chemistry', url: 'https://openlearning.mit.edu/courses-programs/mitx-courses/introduction-solid-state-chemistry' },
  writing: { label: 'MIT OCW · Writing and Reading Short Stories', url: 'https://ocw.mit.edu/courses/21w-755-writing-and-reading-short-stories-spring-2012/' },
  spatial: { label: 'MIT OCW · Urban Design and Development', url: 'https://ocw.mit.edu/courses/11-001j-introduction-to-urban-design-and-development-spring-2006/' },
  learning: { label: 'OpenStax · Open learning resources', url: 'https://openstax.org/higher-education' },
};

function outline(id: string, sectorId: string, title: string, summary: string, relatedIds: string[] = []): AtlasSubject {
  return { id, sectorId, title, summary, relatedIds, known: [], questions: ['Which foundations, methods and open questions should this branch map first?'], sources: [], coverage: 'outline' };
}
function seed(id: string, sectorId: string, title: string, summary: string, known: string[], sources: AtlasSubject['sources'], relatedIds: string[], questions: string[]): AtlasSubject {
  return { id, sectorId, title, summary, known, sources, relatedIds, questions, coverage: 'seed' };
}

export const ATLAS_SUBJECTS: readonly AtlasSubject[] = [
  seed('software-engineering', 'computing', 'Software engineering', 'From an idea to a dependable, usable system. This initial branch focuses on web systems.', ['Separate structure, presentation and behavior.', 'Develop accessible interfaces and test their behavior.'], [refs.web, refs.access], ['data-management', 'agent-systems', 'interaction-design'], ['What evidence shows that a system works beyond its first successful run?']),
  seed('data-management', 'computing', 'Data management', 'How information is structured, retrieved, synchronized and preserved.', ['Local caches and remote data are distinct states.', 'Offline synchronization needs an explicit conflict policy.'], [refs.data], ['software-engineering', 'agent-systems'], ['Which data is authoritative, and how are corrections retained?']),
  seed('agent-systems', 'computing', 'Agent systems', 'Systems that connect AI reasoning with bounded tools and external context.', ['An MCP host connects clients to specialized servers.', 'Tools, resources and prompts serve different roles.'], [refs.agents], ['software-engineering', 'data-management', 'education'], ['Which actions require permission, and what proves that a task finished?']),
  outline('mathematics', 'foundations', 'Mathematics', 'Structures, quantity, relationships and the language of proof.', ['physics', 'data-management']),
  outline('physics', 'foundations', 'Physics', 'Matter, motion, energy and the models used to explain them.', ['mathematics', 'engineering', 'astronomy']),
  outline('chemistry', 'foundations', 'Chemistry', 'Composition, transformations and interactions of matter.', ['materials-science', 'biology']),
  seed('engineering', 'engineering', 'Engineering systems', 'Connecting requirements, models, components and tests to create working systems.', ['Mechanisms, dynamics and control must work together.', 'Actuators, sensing and software are interdependent design choices.'], [refs.robotics], ['robotics', 'materials-science', 'modular-design'], ['What can we actually build and test with available materials?']),
  seed('robotics', 'engineering', 'Robotics', 'Embodied systems that sense, decide and act in the physical world.', ['Kinematics describes motion and geometry.', 'Control, actuators and sensors connect a plan to physical behavior.'], [refs.robotics], ['materials-science', 'agent-systems', 'engineering'], ['Which prototype would test one mechanism with the least ambiguity?']),
  seed('materials-science', 'engineering', 'Materials science', 'Understanding how structure and composition shape a material’s behavior.', ['Atomic arrangement and bonding inform material properties.', 'Materials include metals, ceramics, semiconductors and polymers.'], [refs.materials], ['chemistry', 'robotics', 'energy-systems'], ['What trade-offs matter: stiffness, weight, conductivity, durability or availability?']),
  outline('biology', 'life', 'Biology', 'Living systems, from cells to organisms and ecosystems.', ['chemistry', 'ecology', 'health-sciences']),
  outline('health-sciences', 'life', 'Health sciences', 'A place to map established health knowledge and its limits; not a personal medical assessment.', ['biology', 'psychology']),
  outline('psychology', 'life', 'Mind and behavior', 'Cognition, perception, behavior and human experience.', ['education', 'interaction-design']),
  outline('earth-systems', 'planet', 'Earth systems', 'The interacting atmosphere, oceans, land and climate.', ['ecology', 'energy-systems']),
  outline('ecology', 'planet', 'Ecology', 'Relationships among organisms and their environments.', ['biology', 'agriculture']),
  outline('agriculture', 'planet', 'Food and agriculture', 'Growing, producing and distributing food within ecological constraints.', ['ecology', 'economics']),
  outline('energy-systems', 'energy', 'Energy systems', 'Generation, conversion, storage and use of energy.', ['physics', 'materials-science']),
  outline('manufacturing', 'energy', 'Manufacturing', 'Processes that turn materials and designs into repeatable products.', ['engineering', 'modular-design']),
  outline('resource-cycles', 'energy', 'Resource cycles', 'Material flows, recovery, reuse and the boundaries of circular systems.', ['materials-science', 'ecology']),
  seed('spatial-design', 'built-world', 'Spatial design', 'How arrangements of space shape movement, use and experience.', ['Urban design connects physical form with social context.', 'Plans must be examined at more than one scale.'], [refs.spatial], ['circulation-design', 'modular-design', 'interaction-design'], ['What changes when a design is experienced at human scale?']),
  outline('circulation-design', 'built-world', 'Movement and circulation', 'Mapping routes, access, flow and the connections between places.', ['spatial-design', 'simulation-games']),
  outline('modular-design', 'built-world', 'Modular design', 'Designing parts and interfaces that can combine into larger systems.', ['manufacturing', 'spatial-design', 'engineering']),
  outline('economics', 'economy', 'Economics', 'Production, exchange, allocation and the choices made under constraints.', ['institutions', 'agriculture']),
  outline('organizations', 'economy', 'Organizations', 'How people coordinate goals, responsibilities and decisions.', ['institutions', 'education']),
  outline('finance', 'economy', 'Finance', 'A branch for financial systems and evidence-based concepts; not personal investment advice.', ['economics', 'mathematics']),
  outline('institutions', 'society', 'Institutions and governance', 'Rules, organizations and collective decision-making.', ['economics', 'history']),
  outline('history', 'society', 'History', 'People, events, change and the interpretation of historical evidence.', ['institutions', 'creative-writing']),
  outline('law-and-ethics', 'society', 'Law and ethics', 'Norms, responsibilities, legal systems and ethical reasoning.', ['institutions', 'agent-systems']),
  seed('creative-writing', 'culture', 'Creative writing', 'Making and examining stories through writing, reading and revision.', ['Reading and writing can be practiced together.', 'Drafts and criticism provide material for revision.'], [refs.writing], ['history', 'psychology', 'simulation-games'], ['Which perspective, memory or unanswered question makes a story worth following?']),
  seed('interaction-design', 'culture', 'Interaction design', 'Making the relationship between people and a system understandable and usable.', ['Information must be perceivable and controls operable.', 'Meaning and behavior should remain understandable across devices.'], [refs.access], ['software-engineering', 'psychology', 'spatial-design'], ['Can someone understand the next useful action without an explanation?']),
  outline('simulation-games', 'culture', 'Games and simulation', 'Interactive systems for play, experimentation and exploring consequences.', ['spatial-design', 'agent-systems']),
  seed('education', 'learning', 'Education', 'How knowledge is taught, practiced, assessed and made accessible.', ['A learning resource is not evidence of a learner’s understanding.', 'A curriculum gives a bounded scope for organizing study.'], [refs.learning], ['psychology', 'agent-systems', 'interaction-design'], ['What observation would demonstrate learning rather than only participation?']),
  outline('research-methods', 'learning', 'Research methods', 'Questions, evidence, measurement, inference and reproducible investigation.', ['mathematics', 'data-management']),
  outline('communication', 'learning', 'Communication', 'How meaning is expressed, interpreted and shared.', ['creative-writing', 'education']),
  outline('astronomy', 'space', 'Astronomy', 'Observing and explaining celestial objects and cosmic structures.', ['physics', 'mathematics']),
  outline('spaceflight', 'space', 'Spaceflight', 'Engineering for travel, operation and observation beyond Earth.', ['engineering', 'energy-systems']),
  outline('frontier-questions', 'space', 'Frontier questions', 'A future branch for clearly labeled open questions, not asserted breakthroughs.', ['research-methods', 'physics']),
];

const sector = (id: string, title: string, subtitle: string, color: string): AtlasSector => ({
  id, title, subtitle, color, subjectIds: ATLAS_SUBJECTS.filter(s => s.sectorId === id).map(s => s.id),
});
export const ATLAS_SECTORS: readonly AtlasSector[] = [
  sector('foundations', 'Fundamental sciences', 'Patterns · matter · principles', '#606b98'),
  sector('computing', 'Computing & intelligence', 'Information · systems · agency', '#b95139'),
  sector('engineering', 'Engineering & materials', 'Mechanisms · making · possibility', '#5b7c68'),
  sector('life', 'Life & mind', 'Living systems · health · behavior', '#8d6d8d'),
  sector('planet', 'Earth & ecosystems', 'Climate · habitats · food', '#557f79'),
  sector('energy', 'Energy & resources', 'Power · production · cycles', '#ad7d32'),
  sector('built-world', 'The built world', 'Space · movement · structures', '#9c684c'),
  sector('economy', 'Economy & enterprise', 'Value · organization · exchange', '#797b4d'),
  sector('society', 'Society & governance', 'People · institutions · responsibility', '#7c6f96'),
  sector('culture', 'Culture & creation', 'Stories · design · play', '#ab626b'),
  sector('learning', 'Learning & discovery', 'Knowledge · inquiry · expression', '#55778c'),
  sector('space', 'Space & frontiers', 'Cosmos · exploration · unknowns', '#727599'),
];
