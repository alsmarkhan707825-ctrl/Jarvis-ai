import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, CloudRain, CloudSun, Droplets, MapPin, RefreshCw, Sun, Wind } from 'lucide-react';
import { getLiveGpsCoordinates } from '../services/permissionClient';

interface WeatherData {
  city: string;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKmh: number;
  condition: string;
  isDay: boolean;
  updatedAt: string;
}

interface WeatherWidgetProps {
  locationAllowed?: boolean;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ locationAllowed = false }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadWeather = useCallback(async () => {
    setLoading(true);
    try {
      let query = '';
      if (locationAllowed) {
        const coords = await getLiveGpsCoordinates();
        if (coords) {
          query = `?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lng)}`;
        }
      }
      const resp = await fetch(`/api/weather${query}`);
      if (resp.ok) {
        const data = (await resp.json()) as WeatherData;
        setWeather(data);
      }
    } catch {
      // ignore transient offline error
    } finally {
      setLoading(false);
    }
  }, [locationAllowed]);

  useEffect(() => {
    void loadWeather();
    const timer = window.setInterval(() => {
      void loadWeather();
    }, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadWeather]);

  const renderWeatherIcon = () => {
    const cond = (weather?.condition || '').toLowerCase();
    if (/rain|shower|storm|drizzle/.test(cond)) {
      return <CloudRain className="w-6 h-6 text-blue-600 dark:text-cyan-400" />;
    }
    if (/cloud|overcast|fog/.test(cond)) {
      return <Cloud className="w-6 h-6 text-slate-500 dark:text-slate-300" />;
    }
    if (/partly/.test(cond)) {
      return <CloudSun className="w-6 h-6 text-amber-500 dark:text-amber-400" />;
    }
    return <Sun className="w-6 h-6 text-amber-500 dark:text-amber-400" />;
  };

  return (
    <div className="w-full max-w-md rounded-2xl jarvis-surface px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 flex items-center justify-center shrink-0">
          {renderWeatherIcon()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              {weather ? `${weather.temperatureC}°C` : '--°C'}
            </span>
            <span className="text-xs font-semibold text-blue-700 dark:text-cyan-300 truncate">
              {weather ? weather.condition : 'Fetching weather...'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0 text-blue-600 dark:text-cyan-400" />
              {weather?.city || 'Live Weather'}
            </span>
            {weather && (
              <>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Droplets className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                  {weather.humidity}%
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Wind className="w-3 h-3 text-slate-400" />
                  {weather.windKmh} km/h
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void loadWeather()}
        aria-label="Refresh Live Weather"
        title="Refresh Live Weather"
        className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors shrink-0"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
