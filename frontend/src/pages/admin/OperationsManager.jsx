import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OperationsManager = () => {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingOp, setEditingOp] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    operation_type: 'combat',
    date: '',
    time: '',
    max_participants: ''
  });

  useEffect(() => {
    fetchOperations();
  }, []);

  const fetchOperations = async () => {
    try {
      const response = await axios.get(`${API}/operations`);
      setOperations(response.data);
    } catch (error) {
      console.error('Error fetching operations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const payload = {
        ...formData,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : null
      };

      if (editingOp) {
        await axios.put(`${API}/admin/operations/${editingOp.id}`, payload, config);
      } else {
        await axios.post(`${API}/operations`, payload, config);
      }

      await fetchOperations();
      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving operation:', error);
      alert(error.response?.data?.detail || 'Error saving operation');
    }
  };

  const handleEdit = (op) => {
    setEditingOp(op);
    setFormData({
      title: op.title,
      description: op.description,
      operation_type: op.operation_type,
      date: op.date,
      time: op.time,
      max_participants: op.max_participants || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this operation?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.delete(`${API}/admin/operations/${id}`, config);
      await fetchOperations();
    } catch (error) {
      console.error('Error deleting operation:', error);
      alert('Error deleting operation');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      operation_type: 'combat',
      date: '',
      time: '',
      max_participants: ''
    });
    setEditingOp(null);
  };

  const getTypeColor = (type) => {
    const colors = {
      combat: 'bg-red-700',
      training: 'bg-blue-600',
      recon: 'bg-green-600',
      support: 'bg-yellow-600'
    };
    return colors[type] || 'bg-gray-600';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              OPERATIONS MANAGEMENT
            </h1>
            <p className="text-gray-400 mt-2">Create and manage tactical operations</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-red-700 hover:bg-red-800">
                <Plus className="w-4 h-4 mr-2" />
                New Operation
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {editingOp ? 'Edit Operation' : 'Create New Operation'}
                </DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="bg-black border-gray-700"
                  />
                </div>
                
                <div>
                  <Label>Description</Label>
                  <Textarea
                    required
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="bg-black border-gray-700"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={formData.operation_type}
                      onValueChange={(value) => setFormData({...formData, operation_type: value})}
                    >
                      <SelectTrigger className="bg-black border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="combat">Combat</SelectItem>
                        <SelectItem value="training">Training</SelectItem>
                        <SelectItem value="recon">Recon</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Max Participants</Label>
                    <Input
                      type="number"
                      value={formData.max_participants}
                      onChange={(e) => setFormData({...formData, max_participants: e.target.value})}
                      className="bg-black border-gray-700"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="bg-black border-gray-700"
                    />
                  </div>
                  
                  <div>
                    <Label>Time</Label>
                    <Input
                      type="time"
                      required
                      value={formData.time}
                      onChange={(e) => setFormData({...formData, time: e.target.value})}
                      className="bg-black border-gray-700"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="border-gray-700"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-red-700 hover:bg-red-800">
                    {editingOp ? 'Update' : 'Create'} Operation
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading operations...</div>
        ) : operations.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-12 text-center text-gray-400">
              No operations yet. Create your first operation!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {operations.map((op) => (
              <Card key={op.id} className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`${getTypeColor(op.operation_type)} px-3 py-1 rounded text-xs font-bold uppercase`}>
                          {op.operation_type}
                        </span>
                        {op.max_participants && (
                          <span className="text-sm text-gray-400">
                            <Users className="inline w-4 h-4 mr-1" />
                            {op.rsvp_list?.length || 0}/{op.max_participants}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                        {op.title}
                      </CardTitle>
                      <p className="text-gray-400 mt-2">{op.description}</p>
                      <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                        <span>📅 {op.date}</span>
                        <span>🕒 {op.time}</span>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(op)}
                        className="border-gray-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(op.id)}
                        className="border-red-700 text-red-500 hover:bg-red-700/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default OperationsManager;
