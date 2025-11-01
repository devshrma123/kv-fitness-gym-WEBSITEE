import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Member, Supplement, ReportStats, PaymentStatus, Gender, MembershipPlan } from './types';
import { calculateEndDate, formatCurrency, formatDate, fileToBase64 } from './utils/helpers';
import { Dashboard } from './components/Dashboard';
import { Registration } from './components/Registration';
import { Members } from './components/Members';
import { Supplements } from './components/Supplements';
import { Reports } from './components/Reports';
import { MemberDetailModal } from './components/MemberDetailModal';
import { CameraModal } from './components/CameraModal';
import { Notification, NotificationType } from './components/Notification';

type Section = 'registration' | 'members' | 'supplements' | 'reports';

declare const Gun: any;

const App: React.FC = () => {
    const [activeSection, setActiveSection] = useState<Section>('registration');
    const [members, setMembers] = useState<Member[]>([]);
    const [supplements, setSupplements] = useState<Supplement[]>([]);
    const [memberIdCounter, setMemberIdCounter] = useState<number>(1);
    const [supplementIdCounter, setSupplementIdCounter] = useState<number>(1);

    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [isCameraOpen, setCameraOpen] = useState<boolean>(false);
    const [photoFor, setPhotoFor] = useState<'registration' | 'edit' | null>(null);
    const [tempPhoto, setTempPhoto] = useState<string | null>(null);
    
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    
    const gun = useMemo(() => Gun(['https://gun-manhattan.herokuapp.com/gun']), []);
    const gunMembers = useMemo(() => gun.get('kv_fitness_members'), [gun]);
    const gunSupplements = useMemo(() => gun.get('kv_fitness_supplements'), [gun]);
    const gunCounters = useMemo(() => gun.get('kv_fitness_counters'), [gun]);

    useEffect(() => {
        gunMembers.map().on((member: Member | null, id: string) => {
            const cleanMember = member ? { ...member } : null;
            if (cleanMember) delete (cleanMember as any)._;

            setMembers(prev => {
                const index = prev.findIndex(m => m.id === id);
                
                // Handle deletion
                if (!cleanMember) {
                    return index !== -1 ? prev.filter(m => m.id !== id) : prev;
                }

                const newMember = { ...cleanMember, id };
                
                // Handle update
                if (index !== -1) {
                    const updated = [...prev];
                    updated[index] = newMember;
                    return updated;
                }
                
                // Handle addition
                return [...prev, newMember];
            });
        });

        gunSupplements.map().on((supplement: Supplement | null, id: string) => {
            const cleanSupplement = supplement ? { ...supplement } : null;
            if (cleanSupplement) delete (cleanSupplement as any)._;

            setSupplements(prev => {
                const index = prev.findIndex(s => s.id === id);

                if(!cleanSupplement) {
                    return index !== -1 ? prev.filter(s => s.id !== id) : prev;
                }

                const newSupplement = { ...cleanSupplement, id };

                if (index !== -1) {
                    const updated = [...prev];
                    updated[index] = newSupplement;
                    return updated;
                }
                return [...prev, newSupplement];
            });
        });
        
        gunCounters.get('memberIdCounter').on((data: number | undefined) => {
            if (data) {
                setMemberIdCounter(data);
            } else {
                gunCounters.get('memberIdCounter').put(1);
            }
        });
        
        gunCounters.get('supplementIdCounter').on((data: number | undefined) => {
            if (data) {
                setSupplementIdCounter(data);
            } else {
                gunCounters.get('supplementIdCounter').put(1);
            }
        });

        return () => {
            gunMembers.off();
            gunSupplements.off();
            gunCounters.off();
        };
    }, [gunMembers, gunSupplements, gunCounters]);

    const reportStats = useMemo<ReportStats>(() => {
        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7);

        const newMembers = members.filter(member => member.registrationDate.startsWith(currentMonth)).length;

        const activeMembers = members.filter(member => {
            const startDate = new Date(member.startDate);
            const endDate = new Date(member.endDate);
            return startDate <= today && endDate >= today;
        }).length;
        
        const expiredMembers = members.filter(member => new Date(member.endDate) < today).length;

        const gymCollected = members.reduce((sum, member) => sum + member.amountPaid, 0);
        const gymDue = members.reduce((sum, member) => sum + member.dueAmount, 0);

        const supplementSales = supplements.reduce((sum, s) => sum + s.amountPaid, 0);
        const supplementDue = supplements.reduce((sum, s) => sum + s.dueAmount, 0);
        const supplementsSold = supplements.length;

        return { newMembers, activeMembers, expiredMembers, gymCollected, gymDue, supplementSales, supplementDue, supplementsSold };
    }, [members, supplements]);

    const showNotification = (message: string, type: NotificationType) => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleRegisterMember = (memberData: Omit<Member, 'id' | 'registrationDate' | 'dueAmount'>) => {
        const id = `KV${String(memberIdCounter).padStart(4, '0')}`;
        const newMember: Member = {
            ...memberData,
            id,
            dueAmount: memberData.gymFees - memberData.amountPaid,
            registrationDate: new Date().toISOString(),
        };
        gunMembers.get(id).put(newMember);
        gunCounters.get('memberIdCounter').put(memberIdCounter + 1);
        showNotification('Member registered successfully!', 'success');
        setActiveSection('members');
    };
    
    const handleUpdateMember = (updatedMember: Member) => {
        gunMembers.get(updatedMember.id).put(updatedMember);
        setSelectedMember(updatedMember);
        showNotification('Member updated successfully!', 'success');
    };

    const handleDeleteMember = (memberId: string) => {
        gunMembers.get(memberId).put(null);
        
        const memberSupplements = supplements.filter(s => s.memberId === memberId);
        memberSupplements.forEach(s => {
            gunSupplements.get(s.id).put(null);
        });

        setSelectedMember(null);
        showNotification('Member and associated supplements deleted.', 'success');
    };

    const handleAddSupplement = (supplementData: Omit<Supplement, 'id' | 'createdDate' | 'dueAmount' | 'memberName'>) => {
        const member = members.find(m => m.id === supplementData.memberId);
        if (!member) {
            showNotification('Selected member not found!', 'error');
            return;
        }
        
        const id = `SUP${String(supplementIdCounter).padStart(4, '0')}`;
        const newSupplement: Supplement = {
            ...supplementData,
            id,
            memberName: member.fullName,
            dueAmount: supplementData.supplementAmount - supplementData.amountPaid,
            createdDate: new Date().toISOString(),
        };
        gunSupplements.get(id).put(newSupplement);
        gunCounters.get('supplementIdCounter').put(supplementIdCounter + 1);
        showNotification('Supplement added successfully!', 'success');
    };
    
    const handlePhotoCapture = (photo: string) => {
        if(photoFor === 'registration') {
            setTempPhoto(photo);
        } else if (photoFor === 'edit' && selectedMember) {
            const updatedMember = { ...selectedMember, photo };
            handleUpdateMember(updatedMember);
        }
        setCameraOpen(false);
        setPhotoFor(null);
    };

    const NavButton: React.FC<{ section: Section; label: string; icon: string; }> = ({ section, label, icon }) => (
        <button
            className={`flex-grow sm:flex-grow-0 py-3 px-5 text-sm md:text-base font-semibold uppercase tracking-wider transition-all duration-300 ease-in-out relative rounded-lg backdrop-blur-sm flex items-center justify-center gap-2 ${
                activeSection === section
                    ? 'bg-cyan-500/30 text-white border border-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'bg-gray-500/10 text-sky-200 border border-transparent hover:bg-cyan-500/20 hover:text-white hover:border-cyan-500/50'
            }`}
            onClick={() => setActiveSection(section)}
        >
            <span>{icon}</span> {label}
        </button>
    );

    return (
        <div className="bg-slate-900 text-gray-200 min-h-screen font-exo">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <header className="bg-black/30 backdrop-blur-xl border-b border-cyan-500/20 sticky top-0 z-40 shadow-2xl shadow-black/50">
                <div className="container mx-auto px-4 py-8 text-center">
                    <h1 className="font-orbitron text-4xl md:text-6xl font-black uppercase tracking-widest animate-shimmer">
                        KV Fitness Gym
                    </h1>
                    <p className="text-sky-300 text-sm md:text-base font-light uppercase tracking-[4px] mt-2 text-shadow shadow-sky-400/50">
                        Train Hard. Stay Fit.
                    </p>
                </div>
            </header>
            
            <main className="container mx-auto p-4 md:p-8">
                <nav className="my-8 flex flex-col sm:flex-row justify-center items-center gap-4">
                    <NavButton section="registration" label="Registration" icon="⚡" />
                    <NavButton section="members" label="Members" icon="👤" />
                    <NavButton section="supplements" label="Supplements" icon="🧬" />
                    <NavButton section="reports" label="Reports" icon="📊" />
                </nav>

                <div className="mt-8">
                    {activeSection === 'registration' && <Registration onRegister={handleRegisterMember} openCamera={() => { setPhotoFor('registration'); setCameraOpen(true); }} tempPhoto={tempPhoto} setTempPhoto={setTempPhoto} />}
                    {activeSection === 'members' && <Members members={members} onSelectMember={setSelectedMember} />}
                    {activeSection === 'supplements' && <Supplements members={members} supplements={supplements} onAddSupplement={handleAddSupplement} />}
                    {activeSection === 'reports' && (
                        <>
                            <Dashboard stats={reportStats} />
                            <div className="mt-8">
                                <Reports members={members} supplements={supplements} />
                            </div>
                        </>
                    )}
                </div>
            </main>

            {selectedMember && (
                <MemberDetailModal 
                    member={selectedMember} 
                    supplements={supplements.filter(s => s.memberId === selectedMember.id)}
                    onClose={() => setSelectedMember(null)}
                    onUpdate={handleUpdateMember}
                    onDelete={handleDeleteMember}
                    onTakePhoto={() => { setPhotoFor('edit'); setCameraOpen(true); }}
                />
            )}

            {isCameraOpen && (
                <CameraModal 
                    onCapture={handlePhotoCapture} 
                    onClose={() => { setCameraOpen(false); setPhotoFor(null); }} 
                />
            )}
        </div>
    );
};

export default App;