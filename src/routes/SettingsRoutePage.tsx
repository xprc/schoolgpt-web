import { useNavigate } from 'react-router';
import SettingsPage from '../components/SettingsPage';
import RoutePageFrame from './RoutePageFrame';

export default function SettingsRoutePage() {
    const navigate = useNavigate();

    return (
        <RoutePageFrame>
            {({ appearance, onAuthExpired }) => (
                <SettingsPage
                    theme={appearance.theme}
                    setTheme={appearance.setTheme}
                    lightBg={appearance.lightBg}
                    setLightBg={appearance.setLightBg}
                    darkBg={appearance.darkBg}
                    setDarkBg={appearance.setDarkBg}
                    onClose={() => navigate('/')}
                    onAuthExpired={onAuthExpired}
                />
            )}
        </RoutePageFrame>
    );
}
