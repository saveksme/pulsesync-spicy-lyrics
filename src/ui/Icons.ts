// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics): src/components/Styling/Icons.ts
const Line = (body: string) =>
  `<svg class="NoFill" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const Frame = `<rect x="3" y="4" width="18" height="16" rx="3"/>`;

const TrackSkip = `
	<div class="PlaybackControl TrackSkip REPLACEME">
		<svg viewBox="0 0 35 20" xmlns="http://www.w3.org/2000/svg">
			<path d="M 19.467 19.905 C 20.008 19.905 20.463 19.746 21.005 19.426 L 33.61 12.023 C 34.533 11.482 35 10.817 35 9.993 C 35 9.158 34.545 8.53 33.61 7.977 L 21.005 0.574 C 20.463 0.254 19.998 0.094 19.456 0.094 C 18.374 0.094 17.475 0.917 17.475 2.418 L 17.475 9.49 C 17.315 8.898 16.873 8.408 16.135 7.977 L 3.529 0.574 C 3 0.254 2.533 0.094 1.993 0.094 C 0.911 0.094 0 0.917 0 2.418 L 0 17.582 C 0 19.083 0.91 19.906 1.993 19.906 C 2.533 19.906 3 19.746 3.529 19.426 L 16.135 12.023 C 16.861 11.593 17.315 11.088 17.475 10.485 L 17.475 17.582 C 17.475 19.083 18.386 19.906 19.467 19.906 L 19.467 19.905 Z" fill-rule="nonzero"/>
		</svg>
	</div>
`;

export const Icons = {
  Close: Line(`<path d="m5.5 5.5 13 13"/><path d="m18.5 5.5-13 13"/>`),
  // The page in miniature: cover and title on the NowBar's side, lyric lines on the other.
  NowBar: Line(
    `<g class="SL_IconPart SL_IconCover"><rect x="3" y="5" width="9" height="9" rx="2"/><path d="M4.5 18.5h6"/></g><g class="SL_IconPart SL_IconLyrics"><path d="M15.5 7.5h5"/><path d="M15.5 11.5h5"/><path d="M15.5 15.5h3"/></g>`
  ),
  // Screen edges, no window: the whole display.
  Fullscreen: Line(
    `<path class="SL_IconPart SL_NudgeTL" d="M3.5 8.5V6A2.5 2.5 0 0 1 6 3.5h2.5"/><path class="SL_IconPart SL_NudgeTR" d="M15.5 3.5H18A2.5 2.5 0 0 1 20.5 6v2.5"/><path class="SL_IconPart SL_NudgeBR" d="M20.5 15.5V18a2.5 2.5 0 0 1-2.5 2.5h-2.5"/><path class="SL_IconPart SL_NudgeBL" d="M8.5 20.5H6A2.5 2.5 0 0 1 3.5 18v-2.5"/>`
  ),
  // Fullscreen turned inside out: the way back to Cinema View from fullscreen. Each corner
  // leans toward the centre on hover, so it carries the opposite nudge to its position.
  CloseFullscreen: Line(
    `<path class="SL_IconPart SL_NudgeBR" d="M8.5 3.5V6A2.5 2.5 0 0 1 6 8.5H3.5"/><path class="SL_IconPart SL_NudgeBL" d="M20.5 8.5H18A2.5 2.5 0 0 1 15.5 6V3.5"/><path class="SL_IconPart SL_NudgeTL" d="M15.5 20.5V18a2.5 2.5 0 0 1 2.5-2.5h2.5"/><path class="SL_IconPart SL_NudgeTR" d="M3.5 15.5H6A2.5 2.5 0 0 1 8.5 18v2.5"/>`
  ),
  // The Spotify window, with the lyrics growing to its edges.
  CinemaView: Line(
    `${Frame}<path class="SL_IconPart SL_NudgeTL" d="M10.5 10.5 7 7m0 3V7h3"/><path class="SL_IconPart SL_NudgeBR" d="M13.5 13.5 17 17m0-3v3h-3"/>`
  ),
  // Spotify's layout: lyrics leave the right sidebar for the main view.
  PrevTrack: TrackSkip.replace("REPLACEME", "PrevTrack"),
  Play: `
		<svg viewBox="0 0 18 20" xmlns="http://www.w3.org/2000/svg" class="Play">
			<path d="M 1.558 20 C 2.006 20 2.381 19.838 2.874 19.561 L 16.622 11.572 C 17.527 11.053 17.894 10.65 17.894 9.997 C 17.894 9.35 17.527 8.948 16.622 8.419 L 2.874 0.439 C 2.381 0.153 2.006 0 1.558 0 C 0.706 0 0.106 0.654 0.106 1.694 L 0.106 18.298 C 0.106 19.346 0.706 20 1.558 20 L 1.558 20 Z" fill-rule="nonzero" transform="matrix(1, 0, 0, 1, 0, 8.881784197001252e-16)"/>
		</svg>
	`,
  Pause: `
		<svg viewBox="0 0 15 20" xmlns="http://www.w3.org/2000/svg" class="Pause">
			<path d="M 4.427 19.963 C 5.513 19.963 6.06 19.416 6.06 18.33 L 6.06 1.66 C 6.06 0.545 5.513 0.037 4.427 0.037 L 1.633 0.037 C 0.548 0.037 0 0.575 0 1.66 L 0 18.331 C -0.009 19.416 0.538 19.963 1.633 19.963 L 4.427 19.963 Z M 13.377 19.963 C 14.462 19.963 15 19.416 15 18.33 L 15 1.66 C 15 0.545 14.462 0.037 13.376 0.037 L 10.573 0.037 C 9.487 0.037 8.949 0.575 8.949 1.66 L 8.949 18.331 C 8.949 19.416 9.487 19.963 10.573 19.963 L 13.376 19.963 L 13.377 19.963 Z" fill-rule="nonzero"/>
		</svg>
	`,
  NextTrack: TrackSkip.replace("REPLACEME", "NextTrack"),
  Shuffle: `
        <svg viewBox="0 0 25 20" xmlns="http://www.w3.org/2000/svg">
            <path d="M 19.857 19.948 C 20.135 19.94 20.403 19.841 20.62 19.663 L 24.632 16.281 C 25.123 15.868 25.123 15.223 24.632 14.797 L 20.62 11.402 C 20.403 11.224 20.135 11.125 19.857 11.117 C 19.212 11.117 18.81 11.518 18.81 12.164 L 18.81 14.1 L 17.003 14.1 C 15.853 14.1 15.144 13.738 14.33 12.782 L 11.956 9.981 L 14.33 7.167 C 15.17 6.186 15.802 5.849 16.939 5.849 L 18.81 5.849 L 18.81 7.838 C 18.81 8.471 19.212 8.871 19.857 8.871 C 20.133 8.868 20.403 8.773 20.62 8.6 L 24.632 5.216 C 25.123 4.803 25.123 4.145 24.632 3.732 L 20.62 0.337 C 20.406 0.154 20.136 0.053 19.857 0.052 C 19.212 0.052 18.81 0.453 18.81 1.087 L 18.81 3.241 L 16.925 3.241 C 15.015 3.241 13.827 3.771 12.472 5.398 L 10.277 7.992 L 7.992 5.269 C 6.738 3.798 5.55 3.241 3.719 3.241 L 1.393 3.241 C 0.569 3.241 0 3.784 0 4.546 C 0 5.308 0.567 5.849 1.393 5.849 L 3.628 5.849 C 4.712 5.849 5.436 6.199 6.249 7.167 L 8.611 9.967 L 6.247 12.782 C 5.423 13.752 4.763 14.1 3.691 14.1 L 1.393 14.1 C 0.569 14.1 0 14.641 0 15.403 C 0 16.165 0.567 16.707 1.393 16.707 L 3.783 16.707 C 5.617 16.707 6.738 16.153 7.992 14.68 L 10.29 11.956 L 12.537 14.629 C 13.815 16.153 15.066 16.707 16.925 16.707 L 18.81 16.707 L 18.81 18.902 C 18.81 19.548 19.212 19.948 19.857 19.948 Z"/>
        </svg>
	`,
  Loop: `
		<svg viewBox="0 0 20 17" xmlns="http://www.w3.org/2000/svg" class="Loop">
			<path d="M 1.148 8.951 C 1.786 8.956 2.307 8.441 2.307 7.803 L 2.307 7.201 C 2.307 5.853 3.255 4.949 4.705 4.949 L 11.426 4.949 L 11.426 6.778 C 11.426 7.325 11.773 7.67 12.33 7.67 C 12.572 7.67 12.806 7.583 12.988 7.424 L 16.454 4.515 C 16.879 4.158 16.879 3.589 16.454 3.233 L 12.988 0.301 C 12.806 0.142 12.572 0.055 12.33 0.055 C 11.773 0.055 11.428 0.402 11.428 0.948 L 11.428 2.686 L 4.872 2.686 C 1.895 2.686 0 4.37 0 7.001 L 0 7.803 C 0 8.44 0.513 8.951 1.148 8.951 L 1.148 8.951 Z M 7.681 16.945 C 8.227 16.945 8.572 16.6 8.572 16.053 L 8.572 14.303 L 15.128 14.303 C 18.116 14.303 20 12.619 20 9.988 L 20 9.186 C 20 8.302 19.043 7.75 18.278 8.192 C 17.922 8.397 17.703 8.776 17.703 9.186 L 17.703 9.788 C 17.703 11.136 16.745 12.04 15.295 12.04 L 8.572 12.04 L 8.572 10.223 C 8.572 9.676 8.227 9.331 7.681 9.331 C 7.436 9.331 7.199 9.417 7.012 9.576 L 3.556 12.497 C 3.121 12.842 3.133 13.41 3.556 13.767 L 7.012 16.711 C 7.202 16.862 7.438 16.944 7.681 16.945 L 7.681 16.945 Z" fill-rule="nonzero"/>
		</svg>
	`,
  LoopTrack: `
		<svg viewBox="0 0 20 17" xmlns="http://www.w3.org/2000/svg" class="LoopTrack">
			<path d="M 18.885 6.353 C 19.52 6.353 19.888 6.008 19.888 5.318 L 19.888 1.236 C 19.888 0.511 19.409 0.022 18.696 0.022 C 18.105 0.022 17.758 0.21 17.302 0.556 L 16.176 1.437 C 15.907 1.639 15.819 1.839 15.819 2.073 C 15.819 2.418 16.074 2.697 16.488 2.697 C 16.666 2.697 16.81 2.641 16.956 2.529 L 17.781 1.839 L 17.859 1.839 L 17.859 5.318 C 17.859 6.008 18.227 6.353 18.885 6.353 L 18.885 6.353 Z M 1.147 8.986 C 1.791 9.003 2.319 8.48 2.306 7.836 L 2.306 7.234 C 2.306 5.886 3.254 4.982 4.703 4.982 L 9.274 4.982 L 9.274 6.811 C 9.274 7.358 9.62 7.703 10.178 7.703 C 10.42 7.703 10.653 7.616 10.836 7.457 L 14.302 4.548 C 14.727 4.191 14.727 3.621 14.302 3.265 L 10.837 0.333 C 10.655 0.175 10.421 0.087 10.179 0.088 C 9.622 0.088 9.275 0.434 9.275 0.981 L 9.275 2.719 L 4.873 2.719 C 1.895 2.719 0 4.403 0 7.034 L 0 7.836 C 0 8.494 0.502 8.984 1.148 8.984 L 1.147 8.986 Z M 7.68 16.978 C 8.226 16.978 8.572 16.633 8.572 16.086 L 8.572 14.336 L 15.127 14.336 C 18.115 14.336 20 12.652 20 10.021 L 20 9.219 C 20.013 8.58 19.491 8.058 18.851 8.071 C 18.21 8.054 17.686 8.578 17.703 9.219 L 17.703 9.821 C 17.703 11.169 16.744 12.073 15.295 12.073 L 8.572 12.073 L 8.572 10.256 C 8.572 9.709 8.226 9.364 7.68 9.364 C 7.435 9.364 7.198 9.45 7.011 9.609 L 3.555 12.53 C 3.12 12.875 3.132 13.443 3.555 13.8 L 7.011 16.744 C 7.201 16.895 7.437 16.977 7.68 16.978 L 7.68 16.978 Z" fill-rule="nonzero" transform="matrix(1, 0, 0, 1, 0, -8.881784197001252e-16)"/>
		</svg>
	`,
  // One SVG for every volume state — the waves and the mute cross are toggled via
  // opacity by the .Muted / .Low / .High classes on .VolumeControl, so the markup
  // never has to be swapped while the level changes.
  Volume: `
		<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="Volume">
			<path id="SpicyLyrics_VolumeSpeaker" d="M11 4.5 6.5 8.5H3.5c-.83 0-1.5.67-1.5 1.5v4c0 .83.67 1.5 1.5 1.5h3l4.5 4c.65.58 1.5.1 1.5-.68V5.18c0-.78-.85-1.26-1.5-.68z"/>
			<path id="SpicyLyrics_VolumeWaveLow" d="M15.2 9.6a1 1 0 0 1 1.4 0 3.4 3.4 0 0 1 0 4.8 1 1 0 1 1-1.4-1.4 1.4 1.4 0 0 0 0-2 1 1 0 0 1 0-1.4z"/>
			<path id="SpicyLyrics_VolumeWaveHigh" d="M17.9 6.9a1 1 0 0 1 1.4 0 7.2 7.2 0 0 1 0 10.2 1 1 0 1 1-1.4-1.4 5.2 5.2 0 0 0 0-7.4 1 1 0 0 1 0-1.4z"/>
			<path id="SpicyLyrics_VolumeMute" d="M15.3 8.8a1 1 0 0 1 1.4 0l1.8 1.8 1.8-1.8a1 1 0 1 1 1.4 1.4L19.9 12l1.8 1.8a1 1 0 0 1-1.4 1.4l-1.8-1.8-1.8 1.8a1 1 0 0 1-1.4-1.4l1.8-1.8-1.8-1.8a1 1 0 0 1 0-1.4z"/>
		</svg>
	`,
  // One chevron for both card states; NPVLyrics.css turns the whole svg over when the card
  // collapses. The card's morph keeps the main thread busy, so only composited motion shows.
  NowBarSideSwap: Line(
    `${Frame}<rect class="SL_IconPart SL_IconCover" x="6" y="9.5" width="5" height="5" rx="1.25"/><path class="SL_IconPart SL_IconSwapArrow" d="M14 12h4m-1.75-1.75L18 12l-1.75 1.75"/>`
  ),
};
