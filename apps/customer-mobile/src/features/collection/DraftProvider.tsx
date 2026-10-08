import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Address, Location } from '../../api/contracts';
import { addressIdentity } from '../addresses/distance';
interface Draft {
  address: Address | null;
  categoryCodes: readonly string[];
  selectAddress(address: Address | null): void;
  toggleCategory(code: string): void;
  removeCategory(code: string): void;
  declarations: Readonly<
    Record<string, { quantity?: number; weightGrams?: number }>
  >;
  declare(
    code: string,
    values: { quantity?: number; weightGrams?: number },
  ): void;
  currentLocation: Location | null;
  setCurrentLocation(location: Location): void;
  confirmedAddress: string | null;
  confirmAddress(address?: Address): void;
}
const Context = createContext<Draft | null>(null);
export function DraftProvider({ children }: PropsWithChildren) {
  const [address, setAddress] = useState<Address | null>(null);
  const [categoryCodes, setCategories] = useState<readonly string[]>([]);
  const [declarations, setDeclarations] = useState<
    Record<string, { quantity?: number; weightGrams?: number }>
  >({});
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      address,
      categoryCodes,
      selectAddress: (next: Address | null) => {
        if (addressIdentity(next) !== addressIdentity(address))
          setConfirmedAddress(null);
        setAddress(next);
      },
      toggleCategory: (code: string) =>
        setCategories((codes) =>
          codes.includes(code)
            ? codes.filter((item) => item !== code)
            : [...codes, code],
        ),
      removeCategory: (code: string) => {
        setCategories((codes) => codes.filter((item) => item !== code));
        setDeclarations((values) => {
          const next = { ...values };
          delete next[code];
          return next;
        });
      },
      declarations,
      declare: (
        code: string,
        values: { quantity?: number; weightGrams?: number },
      ) => setDeclarations((previous) => ({ ...previous, [code]: values })),
      currentLocation,
      setCurrentLocation,
      confirmedAddress,
      confirmAddress: (selected?: Address) =>
        setConfirmedAddress(addressIdentity(selected ?? address)),
    }),
    [address, categoryCodes, declarations, currentLocation, confirmedAddress],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDraft() {
  const draft = useContext(Context);
  if (!draft) throw new Error('Collection draft provider is missing');
  return draft;
}
