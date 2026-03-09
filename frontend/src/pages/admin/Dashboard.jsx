import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Calendar, Megaphone, MessageSquare, Image, TrendingUp } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    operations: 0,
    announcements: 0,
    discussions: 0,
    gallery: 0,
    users: 0
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchStats();
  }, []);
  
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const [ops, ann, disc, gal, users] = await Promise.all([
        axios.get(`${API}/operations`),
        axios.get(`${API}/announcements`),
        axios.get(`${API}/discussions`),
        axios.get(`${API}/gallery`),
        axios.get(`${API}/admin/users`, config)
      ]);
      
      setStats({
        operations: ops.data.length,
        announcements: ann.data.length,
        discussions: disc.data.length,
        gallery: gal.data.length,
        users: users.data.length
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const statCards = [
    { label: 'Total Operations', value: stats.operations, icon: Calendar, color: 'red' },
    { label: 'Announcements', value: stats.announcements, icon: Megaphone, color: 'blue' },
    { label: 'Discussions', value: stats.discussions, icon: MessageSquare, color: 'green' },
    { label: 'Gallery Images', value: stats.gallery, icon: Image, color: 'purple' },
    { label: 'Members', value: stats.users, icon: Users, color: 'yellow' }
  ];
  
  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            DASHBOARD
          </h1>
          <p className="text-gray-400">Welcome to the Azimuth Operations Group Admin Panel</p>
        </div>
        
        {loading ? (
          <div className="text-center py-12">Loading statistics...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {statCards.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <Card key={idx} className="bg-gray-900 border-gray-800">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">
                      {stat.label}
                    </CardTitle>
                    <Icon className={`w-5 h-5 text-${stat.color}-500`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                      {stat.value}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a href="/admin/operations" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-red-500" />
              <div className="font-medium">Manage Operations</div>
            </a>
            <a href="/admin/announcements" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <Megaphone className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <div className="font-medium">Post Announcement</div>
            </a>
            <a href="/admin/users" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
              <div className="font-medium">Manage Members</div>
            </a>
            <a href="/admin/site-content" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <div className="font-medium">Edit Site Content</div>
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;