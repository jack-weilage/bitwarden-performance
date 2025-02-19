import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  SimpleChanges,
  OnChanges,
} from "@angular/core";
import { Router } from "@angular/router";
import { Subject, takeUntil, Observable, firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { PolicyType } from "@bitwarden/common/admin-console/enums";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigServiceAbstraction } from "@bitwarden/common/platform/abstractions/config/config.service.abstraction";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { LinkModule } from "@bitwarden/components";

import { OnboardingModule } from "../../../shared/components/onboarding/onboarding.module";

import { VaultOnboardingService as VaultOnboardingServiceAbstraction } from "./services/abstraction/vault-onboarding.service";
import { VaultOnboardingTasks } from "./services/vault-onboarding.service";

@Component({
  standalone: true,
  imports: [OnboardingModule, CommonModule, JslibModule, LinkModule],
  selector: "app-vault-onboarding",
  templateUrl: "vault-onboarding.component.html",
})
export class VaultOnboardingComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ciphers: CipherView[];
  @Output() onAddCipher = new EventEmitter<void>();

  extensionUrl: string;
  isIndividualPolicyVault: boolean;
  private destroy$ = new Subject<void>();
  isNewAccount: boolean;
  private readonly onboardingReleaseDate = new Date("2024-01-01");
  showOnboardingAccess$: Observable<boolean>;

  protected currentTasks: VaultOnboardingTasks;

  protected onboardingTasks$: Observable<VaultOnboardingTasks>;
  protected showOnboarding = false;

  constructor(
    protected platformUtilsService: PlatformUtilsService,
    protected policyService: PolicyService,
    protected router: Router,
    private apiService: ApiService,
    private configService: ConfigServiceAbstraction,
    private vaultOnboardingService: VaultOnboardingServiceAbstraction,
  ) {}

  async ngOnInit() {
    this.showOnboardingAccess$ = await this.configService.getFeatureFlag$<boolean>(
      FeatureFlag.VaultOnboarding,
      false,
    );
    this.onboardingTasks$ = this.vaultOnboardingService.vaultOnboardingState$;
    await this.setOnboardingTasks();
    this.setInstallExtLink();
    this.individualVaultPolicyCheck();
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (this.showOnboarding && changes?.ciphers) {
      await this.saveCompletedTasks({
        createAccount: true,
        importData: this.ciphers.length > 0,
        installExtension: false,
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async checkCreationDate() {
    const userProfile = await this.apiService.getProfile();
    const profileCreationDate = new Date(userProfile.creationDate);

    this.isNewAccount = this.onboardingReleaseDate < profileCreationDate ? true : false;

    if (!this.isNewAccount) {
      await this.hideOnboarding();
    }
  }

  protected async hideOnboarding() {
    await this.saveCompletedTasks({
      createAccount: true,
      importData: true,
      installExtension: true,
    });
  }

  async setOnboardingTasks() {
    const currentTasks = await firstValueFrom(this.onboardingTasks$);
    if (currentTasks == null) {
      const freshStart = {
        createAccount: true,
        importData: this.ciphers?.length > 0,
        installExtension: false,
      };
      await this.saveCompletedTasks(freshStart);
    } else if (currentTasks) {
      this.showOnboarding = Object.values(currentTasks).includes(false);
    }

    if (this.showOnboarding) {
      await this.checkCreationDate();
    }
  }

  private async saveCompletedTasks(vaultTasks: VaultOnboardingTasks) {
    this.showOnboarding = Object.values(vaultTasks).includes(false);
    await this.vaultOnboardingService.setVaultOnboardingTasks(vaultTasks);
  }

  individualVaultPolicyCheck() {
    this.policyService
      .policyAppliesToActiveUser$(PolicyType.PersonalOwnership)
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.isIndividualPolicyVault = data;
      });
  }

  emitToAddCipher() {
    this.onAddCipher.emit();
  }

  setInstallExtLink() {
    if (this.platformUtilsService.isChrome()) {
      this.extensionUrl =
        "https://chrome.google.com/webstore/detail/bitwarden-free-password-m/nngceckbapebfimnlniiiahkandclblb";
    } else if (this.platformUtilsService.isFirefox()) {
      this.extensionUrl =
        "https://addons.mozilla.org/en-US/firefox/addon/bitwarden-password-manager/";
    } else if (this.platformUtilsService.isSafari()) {
      this.extensionUrl = "https://apps.apple.com/us/app/bitwarden/id1352778147?mt=12";
    } else if (this.platformUtilsService.isOpera()) {
      this.extensionUrl =
        "https://addons.opera.com/extensions/details/bitwarden-free-password-manager/";
    } else if (this.platformUtilsService.isEdge()) {
      this.extensionUrl =
        "https://microsoftedge.microsoft.com/addons/detail/jbkfoedolllekgbhcbcoahefnbanhhlh";
    } else {
      this.extensionUrl = "https://bitwarden.com/download/#downloads-web-browser";
    }
  }

  navigateToExtension() {
    window.open(this.extensionUrl, "_blank");
  }
}
