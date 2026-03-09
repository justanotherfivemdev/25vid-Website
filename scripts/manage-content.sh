#!/bin/bash

# Azimuth Operations Group - Quick Content Update Script
# Use this script to quickly update images and text without editing code

echo "🎖️  Azimuth Operations Group - Content Manager"
echo "================================================"
echo ""
echo "📂 Content Configuration File:"
echo "   /app/frontend/src/config/siteContent.js"
echo ""
echo "📸 To update images:"
echo "   1. Edit /app/frontend/src/config/siteContent.js"
echo "   2. Replace image URLs with your own"
echo "   3. Save the file (auto-reloads in ~3 seconds)"
echo ""
echo "📁 Or place images in:"
echo "   /app/frontend/public/images/"
echo ""
echo "🌐 Live Site:"
echo "   https://mission-central-8.preview.emergentagent.com"
echo ""
echo "📖 Full Guide:"
echo "   /app/CUSTOMIZATION_GUIDE.md"
echo ""
echo "================================================"
echo ""

# Offer quick actions
echo "What would you like to do?"
echo "1) Open content config file for editing"
echo "2) Create images directory"
echo "3) View current images configuration"
echo "4) Exit"
echo ""
read -p "Choose an option (1-4): " choice

case $choice in
  1)
    if command -v nano &> /dev/null; then
      nano /app/frontend/src/config/siteContent.js
    elif command -v vim &> /dev/null; then
      vim /app/frontend/src/config/siteContent.js
    else
      echo "Opening with cat (read-only). Install nano or vim for editing."
      cat /app/frontend/src/config/siteContent.js
    fi
    ;;
  2)
    mkdir -p /app/frontend/public/images
    echo "✅ Created /app/frontend/public/images/"
    echo "You can now upload your images to this folder!"
    ;;
  3)
    echo ""
    echo "📸 Current Image Configuration:"
    echo "================================"
    grep -E "(backgroundImage|image:|showcaseImages)" /app/frontend/src/config/siteContent.js | head -20
    echo ""
    echo "See full file: /app/frontend/src/config/siteContent.js"
    ;;
  4)
    echo "Goodbye! 🎖️"
    exit 0
    ;;
  *)
    echo "Invalid option"
    ;;
esac
