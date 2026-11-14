// CSP-compatible Alpine.js components for registration and password change forms
function createPasswordFormState(extra) {
  const state = {
    password: '',
    confirmPassword: '',
    hasRule(name) {
      const p = this.password;
      if (name === 'length') return p.length >= 8;
      if (name === 'lower') return /[a-z]/.test(p);
      if (name === 'upper') return /[A-Z]/.test(p);
      if (name === 'number') return /\d/.test(p);
      if (name === 'special') return /[^a-zA-Z0-9]/.test(p);
      return false;
    },
    ruleIcon(name) {
      return this.hasRule(name) ? '✓' : '○';
    },
    ruleStyle(name) {
      return this.hasRule(name)
        ? 'color: var(--pico-color-success);'
        : 'color: var(--pico-muted-color);';
    },
    get isPasswordValid() {
      return (
        this.hasRule('length') &&
        this.hasRule('lower') &&
        this.hasRule('upper') &&
        this.hasRule('number') &&
        this.hasRule('special')
      );
    },
    get passwordsMatch() {
      return this.password === this.confirmPassword;
    },
  };
  return Object.defineProperties(state, Object.getOwnPropertyDescriptors(extra));
}

document.addEventListener('alpine:init', () => {
  Alpine.data('registerForm', () =>
    createPasswordFormState({
      email: '',
      displayName: '',
      get emailValid() {
        return this.email.includes('@');
      },
      get displayNameValid() {
        return this.displayName.trim().length >= 2;
      },
      get canSubmit() {
        return (
          this.emailValid && this.displayNameValid && this.isPasswordValid && this.passwordsMatch
        );
      },
    })
  );

  Alpine.data('passwordChangeForm', () =>
    createPasswordFormState({
      get canSubmit() {
        return this.isPasswordValid && this.passwordsMatch;
      },
    })
  );
});
