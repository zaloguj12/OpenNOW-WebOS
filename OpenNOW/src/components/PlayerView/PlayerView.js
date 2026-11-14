import PropTypes from 'prop-types';
import {useEffect, useRef, useState} from 'react';
import {createWebRtcClient} from '../../gfn/webrtcClient';
import css from './PlayerView.module.less';

const PlayerView = ({game, menuOpen, onCloseMenu, onExit, onStreamReady, state}) => {
	const videoRef = useRef(null);
	const [guidePage, setGuidePage] = useState('main');
	const [action, setAction] = useState('');
	useEffect(() => {
		if (!game?.session || !['connecting-stream', 'streaming'].includes(state)) return undefined;
		const client = createWebRtcClient({session: game.session, videoElement: videoRef.current});
		client.connect().catch(() => undefined);
		return () => client.disconnect();
	}, [game, state]);
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return undefined;
		const handleReady = () => onStreamReady();
		video.addEventListener('loadeddata', handleReady);
		return () => video.removeEventListener('loadeddata', handleReady);
	}, [onStreamReady]);
	const placeholder = (label) => { setAction(`${label} is not available on webOS yet`); };
	const backdrop = game?.images?.hero || game?.images?.tvBanner;
	return <section className={css.player} style={state !== 'streaming' && backdrop ? {backgroundImage: `linear-gradient(90deg, rgba(11,15,26,.98), rgba(11,15,26,.7) 48%, rgba(11,15,26,.25)), url(${backdrop})`} : undefined}>
		<video autoPlay className={css.video} playsInline ref={videoRef} />
		{state !== 'streaming' && <div className={css.launchStage}><div><p className={css.eyebrow}>Almost there</p><h1>{state === 'queued' ? 'Waiting for a cloud rig' : state === 'preparing' ? 'Preparing your game' : state === 'ready' ? 'Cloud rig ready' : 'Connecting to your game'}</h1><p className={css.launchCopy}>OpenNOW is following the live session state. The stream appears here as soon as the first video frame is ready.</p><div className={css.steps}><span className={css.done}>Session requested</span><span className={state === 'queued' ? css.done : ''}>{state === 'queued' ? 'Queue position reported' : 'Queue cleared'}</span><span className={state === 'preparing' || state === 'connecting' ? css.done : ''}>Rig is set up</span><span className={state === 'connecting-stream' ? css.done : ''}>Connecting the stream</span></div></div><div className={css.rigCard}><p className={css.eyebrow}>Your rig</p><strong>RTX cloud rig</strong><span>Region&nbsp; {game?.session?.zone || 'Auto'}</span><span>Queue&nbsp; {game?.session?.queuePosition || 'Ready'}</span><span>Requested&nbsp; 1080p / 60 FPS</span><small>Only values the session reports are shown. Rows without data are hidden.</small></div></div>}
		{state === 'streaming' && <button className={css.guideTrigger} onClick={() => setGuidePage('main')}>Open stream guide</button>}
		{action && <div className={css.toast}>{action}</div>}
		{menuOpen && <aside className={css.overlay}><header><p className={css.eyebrow}>Stream guide</p><h2>{game?.title || 'Current game'}</h2><span className={css.sessionMeta}>1080p / 60 FPS / Auto region</span></header>{guidePage === 'main' ? <><button className={css.resumeButton} onClick={onCloseMenu}>Resume game</button><div className={css.utilityGrid}><button onClick={() => placeholder('Screenshot')}>Screenshot<small>Placeholder</small></button><button onClick={() => placeholder('Recording')}>Record<small>Unavailable</small></button><button onClick={() => placeholder('Microphone')}>Microphone<small>Muted</small></button><button onClick={() => placeholder('Stats')}>Stats overlay<small>Placeholder</small></button><button onClick={() => setGuidePage('settings')}>Controllers / co-op<small>Input bridge</small></button><button onClick={() => placeholder('Fullscreen')}>Fullscreen<small>Placeholder</small></button></div><button onClick={() => placeholder('Anti-AFK')}>Anti-AFK mode</button><button onClick={() => placeholder('Shortcuts')}>Shortcuts &amp; help</button><button className={css.endButton} onClick={onExit}>End session</button></> : <><button onClick={() => setGuidePage('main')}>Back to guide</button><div className={css.placeholderPanel}>Controller configuration is reserved for the webOS input bridge.</div></>}</aside>}
	</section>;
};

PlayerView.propTypes = {game: PropTypes.object, menuOpen: PropTypes.bool.isRequired, onCloseMenu: PropTypes.func.isRequired, onExit: PropTypes.func.isRequired, onStreamReady: PropTypes.func.isRequired, state: PropTypes.string.isRequired};
export default PlayerView;
