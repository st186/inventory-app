import { useState } from 'react';
import { User, Calendar, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import * as api from '../utils/api';

interface CreateEmployeeProps {
  managerId: string;
  onEmployeeCreated: () => void;
}

export function CreateEmployee({ managerId, onEmployeeCreated }: CreateEmployeeProps) {
  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    email: '',
    password: ''
  });
  const [aadharFront, setAadharFront] = useState<File | null>(null);
  const [aadharBack, setAadharBack] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedEmployeeId, setGeneratedEmployeeId] = useState<string | null>(null);

  const handleFileChange = (field: 'front' | 'back', file: File | null) => {
    if (field === 'front') {
      setAadharFront(file);
    } else {
      setAadharBack(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.dob || !formData.email || !formData.password) {
      alert('Please fill all required fields');
      return;
    }

    if (!aadharFront || !aadharBack) {
      alert('Please upload both Aadhar front and back photos');
      return;
    }

    try {
      setLoading(true);

      // Convert files to base64
      const aadharFrontBase64 = await fileToBase64(aadharFront);
      const aadharBackBase64 = await fileToBase64(aadharBack);

      // Generate employee ID
      const employeeId = `EMP${Date.now().toString().slice(-8)}`;

      // Create employee
      const employeeData = {
        ...formData,
        employeeId,
        managerId,
        aadharFront: aadharFrontBase64,
        aadharBack: aadharBackBase64,
        joiningDate: new Date().toISOString().split('T')[0]
      };

      await api.createEmployee(employeeData);
      
      setGeneratedEmployeeId(employeeId);
      
      // Reset form
      setFormData({ name: '', dob: '', email: '', password: '' });
      setAadharFront(null);
      setAadharBack(null);
      
      onEmployeeCreated();
      
      setTimeout(() => {
        setGeneratedEmployeeId(null);
      }, 5000);
      
    } catch (error) {
      console.error('Error creating employee:', error);
      alert('Error creating employee. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
          <User className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-xl text-gray-900">Create Employee Account</h2>
          <p className="text-sm text-gray-600">Add a new employee to your team</p>
        </div>
      </div>

      {generatedEmployeeId && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-green-900 font-medium">Employee created successfully!</p>
              <p className="text-sm text-green-700">Employee ID: <strong>{generatedEmployeeId}</strong></p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Name */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter full name"
              required
            />
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Date of Birth <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.dob}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="employee@example.com"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Create password"
              required
            />
          </div>
        </div>

        {/* Aadhar Upload */}
        <div className="mb-6">
          <h3 className="text-sm text-gray-700 mb-3">
            Aadhar Card <span className="text-red-500">*</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Front */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-purple-400 transition-colors">
              <label className="cursor-pointer">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-600">Upload Aadhar Front</span>
                  {aadharFront && (
                    <span className="text-xs text-green-600 font-medium">{aadharFront.name}</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('front', e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            {/* Back */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-purple-400 transition-colors">
              <label className="cursor-pointer">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-600">Upload Aadhar Back</span>
                  {aadharBack && (
                    <span className="text-xs text-green-600 font-medium">{aadharBack.name}</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('back', e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p><strong>Note:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Employee ID will be auto-generated</li>
                <li>Leave balance will be calculated from joining date</li>
                <li>Employee will receive login credentials via email</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating Employee...' : 'Create Employee Account'}
        </button>
      </form>
    </div>
  );
}
