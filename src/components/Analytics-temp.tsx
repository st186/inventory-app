              {/* Migration Button for Sales Discrepancy */}
              <button
                onClick={async () => {
                  if (!confirm('🔄 This will update all sales records to lock their discrepancy values.\\n\\nThis prevents discrepancies from changing when inventory is added later.\\n\\nThis is a ONE-TIME operation. Continue?')) {
                    return;
                  }
                  
                  try {
                    if (!context.user?.accessToken) {
                      alert('Not authenticated');
                      return;
                    }
                    
                    // Call the migration API endpoint
                    const result = await api.migrateSalesDiscrepancy(context.user.accessToken);
                    
                    if (result.updated === 0) {
                      alert('✅ All sales records already have locked discrepancy values!');
                      return;
                    }
                    
                    alert(`✅ Migration Complete!\\n\\nUpdated ${result.updated} out of ${result.total} sales records.\\n\\nPlease refresh the page.`);
                    
                    // Reload the page
                    window.location.reload();
                  } catch (error) {
                    console.error('Migration error:', error);
                    alert('Failed to migrate sales data. Please try again.');
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 shadow-lg"
                title="Lock sales discrepancy values (one-time migration)"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Fix Discrepancy</span>
                <span className="sm:hidden">Fix</span>
              </button>
