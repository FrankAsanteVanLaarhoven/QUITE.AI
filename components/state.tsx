"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Panel = {
  title: string;
  sections: { label: string; text: string }[];
};

type Commands = {
  accept?: () => void;
  premium?: () => void;
  pin?: () => void;
  approve?: () => void;
  reject?: () => void;
};

type ConsoleState = {
  panel: Panel | null;
  setPanel: (panel: Panel | null) => void;
  commands: Commands;
  setCommands: (commands: Commands) => void;
  contextOpen: boolean;
  setContextOpen: (open: boolean) => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
};

const Context = createContext<ConsoleState | null>(null);

export function ConsoleStateProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [commands, setCommands] = useState<Commands>({});
  const [contextOpen, setContextOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const value = useMemo(
    () => ({ panel, setPanel, commands, setCommands, contextOpen, setContextOpen, navOpen, setNavOpen }),
    [panel, commands, contextOpen, navOpen],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useConsole() {
  const value = useContext(Context);
  if (!value) throw new Error("Console state is missing.");
  return value;
}

export function usePanel(panel: Panel | null) {
  const { setPanel } = useConsole();
  const serialized = JSON.stringify(panel);
  useEffect(() => {
    setPanel(serialized ? (JSON.parse(serialized) as Panel) : null);
    return () => setPanel(null);
  }, [serialized, setPanel]);
}

const COMMAND_KEYS = ["accept", "premium", "pin", "approve", "reject"] as const;

export function useCommands(commands: Commands) {
  const { setCommands } = useConsole();
  const latest = useRef(commands);
  const signature = COMMAND_KEYS.filter((key) => typeof commands[key] === "function").join(",");
  useEffect(() => {
    latest.current = commands;
  });
  useEffect(() => {
    const call = (key: (typeof COMMAND_KEYS)[number]) => () => latest.current[key]?.();
    const next: Commands = {};
    for (const key of COMMAND_KEYS) {
      if (signature.split(",").includes(key)) next[key] = call(key);
    }
    setCommands(next);
    return () => setCommands({});
  }, [signature, setCommands]);
}
