import { enableMapSet } from 'immer';
import 'web-animations-js';
import { overridePrototypes } from './foundry/prototype-overrides';
import './import-custom-elements';
import './init';

console.log(document.head);

enableMapSet();
overridePrototypes();

// Generic Components
