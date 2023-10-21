import { MesonDebugConfigurationProvider } from "./configprovider";

export class DebugConfigurationProviderLldb extends MesonDebugConfigurationProvider {
  constructor(path: string) {
    super(path);
  }

  override getName(): string {
    return "lldb";
  }
}
