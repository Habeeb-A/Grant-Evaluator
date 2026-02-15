# EA Grant Auditor

An AI-powered grant evaluation tool that simulates a rigorous Effective Altruism fund manager. Analyze grant proposals with comprehensive scoring, cost-effectiveness calculations, and detailed feedback.

## 🌟 Features

- 📄 **Document Upload**: Support for PDF, Word (.docx), and Text files
- 🤖 **AI-Powered Analysis**: Powered by Google Gemini 2.0 Flash
- 📊 **Comprehensive Scoring** (INT Framework):
  - Importance (0-10) - Scale and significance of the problem
  - Neglectedness (0-10) - How underfunded/under-researched
  - Tractability (0-10) - How solvable/actionable
  - Cost-Effectiveness (0-10) - Compared to GiveWell benchmarks
  - Risk Assessment (0-100)
- 🔍 **Deep Dive Tools**:
  - 🔥 Red Team Pre-Mortem Analysis
  - ✨ Budget Reality Check
  - 🧠 Logic Model Builder
- 📈 **Visual Analytics**: Interactive charts and progress bars
- 📝 **Detailed Reports**: Markdown-formatted evaluation reports
- 📥 **Export Functionality**: Download reports as Markdown files
- 💬 **Feedback System**: Built-in feedback collection


## 📋 Evaluation Framework

This tool is grounded in real EA evaluation frameworks:
- **GiveWell**: Cost-effectiveness benchmarks ($50-100/DALY)
- **Open Philanthropy**: Grant evaluation methodology
- **80,000 Hours**: INT framework (Importance × Neglectedness × Tractability)
- **EA Funds**: Multi-dimensional evaluation approach

## ⚙️ Configuration

- **API Key**: Pre-configured in `index.html` (line 313)
- **Web3Forms Key**: Configured for feedback emails
- **All Dependencies**: Loaded via CDN (no build needed)

## 📁 File Structure

```
ea-abu-resources/
├── index.html              # Main application (ready for GitHub Pages)
├── README.md              # This file
├── netlify.toml           # Netlify configuration
├── _redirects             # SPA routing support
├── .gitignore             # Git ignore rules
└── docs/                  # Additional documentation
    ├── FEEDBACK-SETUP.md
    ├── IMPROVEMENTS.md
    └── EMAIL-WEBHOOK-SETUP.md
```

## 🎯 How to Use

1. **Upload a Proposal**: Drag & drop or click to upload PDF, DOCX, or TXT
2. **Evaluate**: Click "Evaluate Proposal" button
3. **Review Results**: See scores, charts, and detailed analysis
4. **Deep Dive**: Use Red Team, Budget Check, or Logic Model tools
5. **Export**: Download the full report as Markdown

## 🔧 Customization

### Update API Key
Edit `index.html` line 313:
```javascript
let apiKey = 'YOUR_API_KEY_HERE';
```

### Update Web3Forms Key
Edit `index.html` line 1087:
```javascript
web3formsData.append('access_key', 'YOUR_ACCESS_KEY');
```

## 📝 License

This project is provided as-is for grant evaluation purposes.

## 🙏 Acknowledgments

Built with frameworks from GiveWell, Open Philanthropy, 80,000 Hours, and EA Funds.

---


**Issues**: Report bugs or request features via the feedback button in the app.
