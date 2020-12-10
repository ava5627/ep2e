import { createEnvironment } from '@src/features/environment';
import { once } from 'remeda';
import { addListener } from 'weightless/util/event';
import type { NonFunction } from '../utility/helper-types';
import { EP } from './system';

type SettingInit<T extends NonFunction> = {
  name?: string;
  config?: boolean;
  hint?: string;
  scope: 'world' | 'client';
  default?: T;
  onChange?: (updatedSetting: Readonly<T>) => unknown;
  type?: typeof Boolean | typeof Number | typeof String;
};

const registeredKeys = new Set<string>();

const registerSystemSetting = <T extends NonFunction>(
  key: string,
  { onChange, ...init }: SettingInit<T>,
) => {
  if (registeredKeys.has(key)) {
    throw new Error(`${key} is already a registered setting.`);
  } else registeredKeys.add(key);

  const eventKey = `ep-setting-${key}`;

  game.settings.register(EP.Name, key, {
    ...init,
    onChange: (updatedSetting: T) => {
      window.dispatchEvent(
        new CustomEvent(eventKey, { detail: updatedSetting }),
      );
      onChange?.(updatedSetting);
    },
  });

  const current = () => game.settings.get(EP.Name, key) as T;

  return {
    get current() {
      return current();
    },
    update: (updated: T | ((currentVal: T) => T)) => {
      const setVal =
        typeof updated === 'function' ? updated(current()) : updated;
      return game.settings.set(EP.Name, key, setVal) as Promise<T>;
    },
    listener: (
      callback: (updatedSetting: T) => unknown,
      options?: AddEventListenerOptions,
    ) => {
      return addListener(
        window,
        eventKey,
        (ev: CustomEvent<T>) => callback(ev.detail),
        options,
      );
    },
  } as const;
};

export const registerEPSettings = once(() => {
  const systemMigrationVersion = registerSystemSetting<number>(
    'systemMigrationVersion',
    {
      scope: 'world',
      config: false,
      default: 0,
    },
  );
  const environment = registerSystemSetting('environment', {
    scope: 'world',
    config: false,
    default: createEnvironment({}),
  });

  const credits = registerSystemSetting<boolean>('credits', {
    name: `${EP.LocalizationNamespace}.useCredits`,
    scope: 'world',
    hint: 'Track credits in addition to GP',
    config: true,
    default: false,
    type: Boolean,
    onChange: () =>
      [...game.actors.values(), ...Object.values(game.actors.tokens)].forEach(
        (actor) => {
          actor.prepareData();
          actor.render(false, {});
        },
      ),
  });

  const glitchOnMeshWounds = registerSystemSetting<boolean>("glitchOnMeshWounds", {
    name: `${EP.LocalizationNamespace}.glitchOnMeshWounds`,
    scope: 'world',
    hint: "Apply optional cumulative 10% change to suffer glitch per mesh wound.",
    config: true,
    default: false,
    type: Boolean,

  })

  return {
    systemMigrationVersion,
    environment,
    credits,
    glitchOnMeshWounds
  } as const;
});
