"use client";
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Search, Loader2, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { usePostHog } from '@/hooks/use-posthog';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const libraries: ("places")[] = ["places"];

const INDUSTRIES = [
  'Dentists', 'Law Firms', 'HVAC', 'Restaurants', 'Real Estate',
  'Gyms', 'Veterinary', 'Salons', 'Contractors', 'Retail',
];

export function ScanInput({
  variant = 'large',
}: {
  variant?: 'large' | 'compact',
}) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [noWebsiteMsg, setNoWebsiteMsg] = useState('');

  // Advanced Options State
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [industry, setIndustry] = useState('');
  const [competitors, setCompetitors] = useState<string[]>(['']);
  const [businessSize, setBusinessSize] = useState('');
  const [includeEmail, setIncludeEmail] = useState(false);
  const [includeSocial, setIncludeSocial] = useState(false);

  const router = useRouter();
  const { captureEvent } = usePostHog();

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    libraries,
  });

  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const addCompetitor = () => {
    if (competitors.length < 3) setCompetitors([...competitors, '']);
  };
  const removeCompetitor = (idx: number) => {
    setCompetitors(competitors.filter((_, i) => i !== idx));
  };
  const updateCompetitor = (idx: number, val: string) => {
    const next = [...competitors];
    next[idx] = val;
    setCompetitors(next);
  };

  const handleSubmit = async (e?: React.FormEvent, submitUrl?: string, placeId?: string) => {
    if (e) e.preventDefault();
    const finalUrl = submitUrl || input;
    if (!finalUrl) return;
    setIsLoading(true);
    setNoWebsiteMsg('');

    const extraData = {
      industry,
      competitors: competitors.filter(Boolean),
      businessSize,
      includeEmail,
      includeSocial
    };

    captureEvent('scan_started', { input: finalUrl, placeId, ...extraData });

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          placeId,
          ...extraData
        })
      });

      const data = await res.json();

      if (res.ok && data.token) {
        router.push(`/scan/${data.token}`);
      } else {
        throw new Error(data.error || 'Failed to start scan');
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current !== null) {
      const place = autocompleteRef.current.getPlace();
      if (!place || !place.place_id) return;

      const newName = place.name || '';
      setInput(newName);

      if (place.website) {
        setNoWebsiteMsg('');
        handleSubmit(undefined, place.website, place.place_id);
      } else {
        setNoWebsiteMsg("This business doesn't have a website listed on Google. You can enter a URL manually.");
      }
    }
  };

  const isLg = variant === 'large';
  const isUrlMode = input.startsWith('http') || (input.includes('.') && !input.includes(' '));

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      {/* Search Input */}
      <form onSubmit={(e) => handleSubmit(e)} className={`relative flex items-center bg-bg-secondary border border-white/10 rounded-full shadow-lg p-1 ${isLg ? 'h-16' : 'h-12'}`}>
        <div className="pl-4 pr-2 text-text-secondary">
          {isUrlMode ? <Globe className={isLg ? 'w-5 h-5' : 'w-4 h-4'} /> : <Search className={isLg ? 'w-5 h-5' : 'w-4 h-4'} />}
        </div>

        {isLoaded && !isUrlMode ? (
          <div className="flex-1 h-full flex items-center">
            <Autocomplete
              onLoad={(autocomplete) => { autocompleteRef.current = autocomplete; }}
              onPlaceChanged={onPlaceChanged}
              className="w-full h-full flex items-center"
              options={{ fields: ['place_id', 'website', 'name'] }}
            >
              <Input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setNoWebsiteMsg('');
                }}
                onFocus={() => captureEvent('scan_input_focus')}
                placeholder="Enter your website URL or business name..."
                className="w-full bg-transparent border-none text-white focus-visible:ring-0 text-sm lg:text-base px-0"
              />
            </Autocomplete>
          </div>
        ) : (
          <Input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setNoWebsiteMsg('');
            }}
            onFocus={() => captureEvent('scan_input_focus')}
            placeholder="Enter your website URL or business name..."
            className="flex-1 bg-transparent border-none text-white focus-visible:ring-0 text-sm lg:text-base px-0"
          />
        )}

        <Button
          type="submit"
          disabled={isLoading || !input}
          className={`gradient-btn rounded-full ${isLg ? 'h-12 px-8' : 'h-10 px-6'}`}
        >
          {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Scan Free →"}
        </Button>
      </form>

      {noWebsiteMsg && (
        <div className="text-sm font-medium text-yellow-500 bg-yellow-500/10 px-4 py-2 rounded-lg border border-yellow-500/20 text-center animate-in fade-in slide-in-from-top-2">
          {noWebsiteMsg}
        </div>
      )}

      {/* Advanced Options Toggle */}
      <div className="w-full">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-white transition-colors w-full justify-center mt-2 mb-3"
        >
          <motion.span animate={{ rotate: advancedOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4" />
          </motion.span>
          Advanced options
        </button>

        {/* Advanced Options Content */}
        <AnimatePresence>
          {advancedOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="glass border border-white/10 rounded-2xl p-6 space-y-6 text-left">

                {/* Industry dropdown */}
                <div>
                  <Label className="text-sm text-text-secondary mb-2 block">Industry (Optional)</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger className="bg-bg-input border-white/10 text-white">
                      <SelectValue placeholder="Select your industry..." />
                    </SelectTrigger>
                    <SelectContent className="bg-bg-card border-white/10">
                      {INDUSTRIES.map((ind) => (
                        <SelectItem key={ind} value={ind.toLowerCase()} className="text-white hover:bg-white/5">
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Business Size Radio (Dropdown for spacing) */}
                <div>
                  <Label className="text-sm text-text-secondary mb-2 block">Business Size</Label>
                  <Select value={businessSize} onValueChange={setBusinessSize}>
                    <SelectTrigger className="bg-bg-input border-white/10 text-white">
                      <SelectValue placeholder="Select business size..." />
                    </SelectTrigger>
                    <SelectContent className="bg-bg-card border-white/10">
                      <SelectItem value="solo" className="text-white hover:bg-white/5">Solo</SelectItem>
                      <SelectItem value="2-10" className="text-white hover:bg-white/5">2-10 employees</SelectItem>
                      <SelectItem value="11-50" className="text-white hover:bg-white/5">11-50 employees</SelectItem>
                      <SelectItem value="50+" className="text-white hover:bg-white/5">50+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Competitor URLs */}
                <div>
                  <Label className="text-sm text-text-secondary mb-2 block">Competitor URLs (Up to 3)</Label>
                  <div className="space-y-3">
                    {competitors.map((val, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={val}
                          onChange={(e) => updateCompetitor(idx, e.target.value)}
                          placeholder={`https://competitor${idx + 1}.com`}
                          className="bg-bg-input border-white/10 text-white placeholder:text-white/20"
                        />
                        {competitors.length > 1 && (
                          <button
                            onClick={() => removeCompetitor(idx)}
                            className="text-text-secondary hover:text-red-400 transition-colors p-2 shrink-0 bg-white/5 rounded-md"
                            aria-label="Remove competitor"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {competitors.length < 3 && (
                      <button
                        onClick={addCompetitor}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-2"
                      >
                        <Plus className="w-3 h-3" /> Add competitor
                      </button>
                    )}
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <Checkbox
                      checked={includeEmail}
                      onCheckedChange={(v: any) => setIncludeEmail(!!v)}
                      className="border-white/20"
                    />
                    <span className="text-sm text-text-secondary group-hover:text-white transition-colors">
                      Include email domain health check
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <Checkbox
                      checked={includeSocial}
                      onCheckedChange={(v) => setIncludeSocial(!!v)}
                      className="border-white/20"
                    />
                    <span className="text-sm text-text-secondary group-hover:text-white transition-colors">
                      Include social media deep dive
                    </span>
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isLg && !advancedOpen && (
        <div className="flex justify-center flex-wrap gap-4 text-xs font-medium text-text-secondary mt-2">
          <span>✓ No credit card</span>
          <span>✓ 30 seconds</span>
          <span>✓ 30+ dimensions</span>
        </div>
      )}
    </div>
  );
}