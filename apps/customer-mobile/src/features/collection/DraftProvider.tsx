import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Address } from '../../api/contracts';
interface Draft {
  address: Address | null;
  categoryCodes: readonly string[];
  selectAddress(address: Address | null): void;
  toggleCategory(code: string): void;
}
const Context = createContext<Draft | null>(null);
export function DraftProvider({ children }: PropsWithChildren) {
  const [address, selectAddress] = useState<Address | null>(null);
  const [categoryCodes, setCategories] = useState<readonly string[]>([]);
  const value = useMemo(
    () => ({
      address,
      categoryCodes,
      selectAddress,
      toggleCategory: (code: string) =>
        setCategories((codes) =>
          codes.includes(code)
            ? codes.filter((item) => item !== code)
            : [...codes, code],
        ),
    }),
    [address, categoryCodes],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDraft() {
  const draft = useContext(Context);
  if (!draft) throw new Error('Collection draft provider is missing');
  return draft;
}
