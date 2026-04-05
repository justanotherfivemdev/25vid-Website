import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookOpen, Clock, User, Calendar, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMemberLayout } from '@/components/MemberLayout';
import { BACKEND_URL, API } from '@/utils/api';

const TrainingPage = () => {
  const inLayout = useMemberLayout();
  const [training, setTraining] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProgram, setSelectedProgram] = useState(null);

  useEffect(() => {
    fetchTraining();
  }, []);

  const fetchTraining = async () => {
    try {
      const res = await axios.get(`${API}/training`);
      setTraining(res.data);
    } catch (e) {
      console.error('Error fetching training:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = searchQuery
    ? training.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.instructor || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : training;

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              {!inLayout && (
                <Link to="/hub" className="text-[#4a6070] hover:text-[#e8c547] transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              )}
              <p
                className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                Professional Development
              </p>
            </div>
            <h1
              className="text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]"
              style={{ fontFamily: "'Share Tech', sans-serif" }}
            >
              TRAINING PROGRAMS
            </h1>
            <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>
              Browse available training courses, view schedules, and sign up for upcoming sessions
            </p>
          </div>
          <BookOpen className="w-10 h-10 text-[#c9a227] opacity-50 hidden md:block" />
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a6070]" />
        <Input
          placeholder="Search training programs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none"
        />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-4 text-center">
          <div
            className="text-2xl font-bold text-[#e8c547]"
            style={{ fontFamily: "'Share Tech', sans-serif" }}
          >
            {training.length}
          </div>
          <div className="text-xs text-[#4a6070] uppercase tracking-wider mt-1" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Available Courses
          </div>
        </div>
        <div className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-4 text-center">
          <div
            className="text-2xl font-bold text-[#e8c547]"
            style={{ fontFamily: "'Share Tech', sans-serif" }}
          >
            {new Set(training.map((t) => t.instructor).filter(Boolean)).size}
          </div>
          <div className="text-xs text-[#4a6070] uppercase tracking-wider mt-1" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Instructors
          </div>
        </div>
        <div className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-4 text-center hidden sm:block">
          <div
            className="text-2xl font-bold text-[#e8c547]"
            style={{ fontFamily: "'Share Tech', sans-serif" }}
          >
            OPEN
          </div>
          <div className="text-xs text-[#4a6070] uppercase tracking-wider mt-1" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Enrollment
          </div>
        </div>
      </div>

      {/* Training programs listing */}
      {loading ? (
        <div className="text-center py-12 text-[#e8c547]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <span className="animate-pulse">■</span> Loading training programs...
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-[rgba(201,162,39,0.12)] bg-[#0c1117] p-12 text-center text-[#4a6070]">
          {searchQuery ? 'No training programs match your search.' : 'No training programs available at this time.'}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="bg-[#0c1117] border-[rgba(201,162,39,0.1)] hover:border-[#e8c547]/30 transition-colors cursor-pointer"
              role="button"
              tabIndex={0}
              aria-expanded={selectedProgram?.id === t.id}
              onClick={() => setSelectedProgram(selectedProgram?.id === t.id ? null : t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedProgram(selectedProgram?.id === t.id ? null : t);
                }
              }}
            >
              {t.image_url && (
                <div className="w-full h-40 overflow-hidden">
                  <img
                    src={
                      t.image_url.startsWith('http')
                        ? t.image_url
                        : `${BACKEND_URL}${t.image_url}`
                    }
                    alt={t.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-[#c9a227]/20 text-[#e8c547] border border-[rgba(201,162,39,0.3)] text-[10px]">
                    COURSE
                  </Badge>
                </div>
                <CardTitle
                  className="text-lg mt-2"
                  style={{ fontFamily: "'Share Tech', sans-serif" }}
                >
                  {t.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#8a9aa8] mb-4 line-clamp-3 whitespace-pre-wrap">
                  {t.description}
                </p>
                <div
                  className="space-y-2 text-xs text-[#4a6070]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[#e8c547]" />
                    <span>{t.instructor}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#e8c547]" />
                    <span>{t.schedule}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#e8c547]" />
                    <span>{t.duration}</span>
                  </div>
                </div>

                {/* Expanded details when selected */}
                {selectedProgram?.id === t.id && (
                  <div className="mt-4 pt-4 border-t border-[rgba(201,162,39,0.12)] space-y-3">
                    <div>
                      <h4
                        className="text-xs uppercase tracking-wider text-[#c9a227] mb-1"
                        style={{ fontFamily: "'Oswald', sans-serif" }}
                      >
                        Full Description
                      </h4>
                      <p className="text-sm text-[#8a9aa8] whitespace-pre-wrap">{t.description}</p>
                    </div>
                    <div>
                      <h4
                        className="text-xs uppercase tracking-wider text-[#c9a227] mb-1"
                        style={{ fontFamily: "'Oswald', sans-serif" }}
                      >
                        How to Sign Up
                      </h4>
                      <p className="text-sm text-[#8a9aa8]">
                        Contact <span className="text-[#e8c547]">{t.instructor}</span> or your chain of
                        command to enroll in this training program. Check the schedule above for the
                        next available session.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#4a6070]">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Added{' '}
                        {t.created_at
                          ? new Date(t.created_at).toLocaleDateString()
                          : 'Recently'}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4 border-[rgba(201,162,39,0.15)] text-[#e8c547] hover:bg-[rgba(201,162,39,0.08)] text-xs uppercase tracking-wider"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProgram(selectedProgram?.id === t.id ? null : t);
                  }}
                >
                  {selectedProgram?.id === t.id ? 'COLLAPSE' : 'VIEW DETAILS'}
                  <ChevronRight
                    className={`w-3 h-3 ml-1 transition-transform ${selectedProgram?.id === t.id ? 'rotate-90' : ''}`}
                  />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrainingPage;
