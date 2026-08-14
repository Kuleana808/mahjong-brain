/** Optional short spoken coaching. Never replaces VoiceOver announcements. */
export function speakCoach(text: string, enabled = true): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 0.96;
    utterance.volume = 0.72;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Spoken coaching is optional and never affects gameplay.
  }
}
