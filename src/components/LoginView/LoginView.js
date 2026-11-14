import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';
import {useCallback, useEffect, useRef, useState} from 'react';

import css from './LoginView.module.less';

const POLL_INTERVAL_MS = 5000;

const LoginView = ({authSession, onCancel, onComplete, onPoll, onStart}) => {
	const [challenge, setChallenge] = useState(null);
	const [status, setStatus] = useState(authSession ? 'Account session is stored on this TV.' : 'Start device sign in.');
	const pollingRef = useRef(null);

	const stopPolling = useCallback(() => {
		if (pollingRef.current) {
			window.clearInterval(pollingRef.current);
			pollingRef.current = null;
		}
	}, []);

	const beginLogin = useCallback(async () => {
		stopPolling();
		setStatus('Requesting device code');
		const nextChallenge = await onStart();
		setChallenge(nextChallenge);
		setStatus('Open the verification link on your phone and enter the code.');
		pollingRef.current = window.setInterval(async () => {
			try {
				const result = await onPoll(nextChallenge);
				if (result?.complete) {
					stopPolling();
					onComplete(result.session);
				} else if (result?.message) {
					setStatus(result.message);
				}
			} catch (error) {
				setStatus(error.message || 'Waiting for sign in');
			}
		}, POLL_INTERVAL_MS);
	}, [onComplete, onPoll, onStart, stopPolling]);

	const cancelLogin = useCallback(async () => {
		stopPolling();
		if (challenge) {
			await onCancel(challenge);
		}
		setChallenge(null);
		setStatus('Device sign in cancelled.');
	}, [challenge, onCancel, stopPolling]);

	useEffect(() => stopPolling, [stopPolling]);

	return (
		<section className={css.login}>
			<header>
				<p className={css.eyebrow}>NVIDIA account</p>
				<h1>Sign in with a phone</h1>
			</header>
			<div className={css.panel}>
				<div className={css.qrSlot} aria-label="Device sign in code">
					<strong>{challenge?.userCode || 'GFN'}</strong>
				</div>
				<div className={css.instructions}>
					<p>{status}</p>
					{challenge?.verificationUri && (
						<a href={challenge.verificationUri}>{challenge.verificationUri}</a>
					)}
					{challenge?.expiresIn && <span>Expires in {Math.round(challenge.expiresIn / 60)} minutes</span>}
					<div className={css.actions}>
						<Button onClick={beginLogin} size="small">{challenge ? 'Restart' : 'Start'}</Button>
						<Button disabled={!challenge} onClick={cancelLogin} size="small">Cancel</Button>
					</div>
				</div>
			</div>
		</section>
	);
};

LoginView.propTypes = {
	authSession: PropTypes.object,
	onCancel: PropTypes.func.isRequired,
	onComplete: PropTypes.func.isRequired,
	onPoll: PropTypes.func.isRequired,
	onStart: PropTypes.func.isRequired
};

export default LoginView;
