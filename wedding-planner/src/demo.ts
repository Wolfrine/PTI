import {empty, emptyRecords, type Records} from './model';
// This synthetic fixture is only dynamically imported behind import.meta.env.DEV.
export function demoRecords():Records {
  const stamp={revision:1,createdAt:'2026-10-15T09:00:00Z',createdBy:'demo-owner',updatedAt:'2026-10-15T09:00:00Z',updatedBy:'demo-owner',archived:false,lastChangeId:'demo'};
  return {...emptyRecords(),
    events:[{...empty.events,...stamp,id:'preview-evening',title:'Family evening · example',date:'2027-01-18',kind:'function',notes:'Invented preview arrangement. No venue or time is confirmed.',owner:'Preview coordinator',status:'proposed',menuText:'Example menu for layout review only.\nA familiar main\nA lighter option\nA favourite sweet'}],
    guests:[{...empty.guests,...stamp,id:'preview-guest',name:'Example guest',household:'Example household',stayFrom:'2027-01-18',stayUntil:'2027-01-20',notes:'Synthetic preview record.'}],
    decisions:[{...empty.decisions,...stamp,id:'preview-decision',title:'Confirm the arrival welcome',owner:'Preview coordinator',proposal:'Discuss the receiving point and a family contact.',status:'unresolved'}],
    arrangements:[{...empty.arrangements,...stamp,id:'preview-stay',title:'Guest welcome & stays',category:'Hospitality',owner:'Preview coordinator',status:'proposed',notes:'Example only. Confirm rooms and arrival arrangements with the selected provider.'}],
  };
}
